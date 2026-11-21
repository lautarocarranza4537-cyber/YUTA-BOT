// Descarga de audio de YouTube/SoundCloud (en memoria, sin guardar archivos).
// No depende de play.js: solo de core.js (y de shield.js si existe).
const { spawn } = require('child_process')
const C = require('./core')

const S = C.S
const ready = C.ready || Promise.resolve()
const errMsg = C.errMsg || (e => (e && e.message) || String(e))
const UA = C.UA || 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const host = C.host || (u => { try { return new URL(u).host } catch { return u } })
const INVIDIOUS = C.INVIDIOUS || ['https://inv.nadeko.net', 'https://yewtu.be']
const PIPED = C.PIPED || ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de']
const fetchJson = C.fetchJson || (async (u, ms = 6000) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
})

// shield.js es opcional: si no está (o es distinto), se trabaja sin él
let shRaw = null
try { shRaw = require('./shield') } catch {}
const sh = {
  rec: (shRaw && typeof shRaw.rec === 'function') ? shRaw.rec : () => {},
  score: (shRaw && typeof shRaw.score === 'function') ? shRaw.score : (n, b) => b,
  cooling: (shRaw && typeof shRaw.cooling === 'function') ? shRaw.cooling : () => false,
  inv: (shRaw && typeof shRaw.inv === 'function') ? shRaw.inv : () => INVIDIOUS,
  pip: (shRaw && typeof shRaw.pip === 'function') ? shRaw.pip : () => PIPED
}

const YT_FMT = 'bestaudio[ext=m4a]/140/bestaudio'
const SC_FMT = 'http_mp3/bestaudio[protocol^=http]/bestaudio'
const TTL = 20 * 60 * 1000
const CAP = 30 * 1024 * 1024
const RELAY = (process.env.RELAY_URL || '').replace(/\/+$/, '')
const cache = new Map()
const keyOf = (id, su) => (id ? 'y:' + id : 's:' + su)
const isBotChallenge = text => /sign[ -]?in to confirm|confirm you(?:'|’)re not a bot|not a bot|unusual traffic|captcha/i.test(String(text || ''))

const IT = [
  { name: 'vr', id: 28, ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L', hl: 'en', gl: 'US' } },
  { name: 'ios', id: 5, ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en', gl: 'US' } },
  { name: 'android', id: 3, ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, osName: 'Android', osVersion: '11', hl: 'en', gl: 'US' } }
]

async function innertube(id, c) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': String(c.id), 'X-YouTube-Client-Version': c.ctx.clientVersion, Origin: 'https://www.youtube.com' },
    body: JSON.stringify({ context: { client: c.ctx }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
    signal: AbortSignal.timeout(10000)
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const j = await r.json()
  const st = j.playabilityStatus
  if (st && st.status && st.status !== 'OK') throw new Error(String(st.reason || st.status).slice(0, 120))
  const fm = (j.streamingData && j.streamingData.adaptiveFormats) || []
  const a = fm.filter(f => /^audio\/mp4/.test(f.mimeType || '') && f.url)
  const pick = a.find(f => f.itag === 140) || a.sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0))[0]
  if (!pick) throw new Error('sin link directo de audio')
  return { url: pick.url, ua: c.ua }
}

function ytdlpUrl(target, fmt, extra = [], ms = 60000) {
  return new Promise((resolve, reject) => {
    if (!S || S.err) return reject(new Error((S && S.err) || 'yt-dlp no está listo'))
    const p = spawn(S.bin, ['--no-playlist', '--no-warnings', '-q', '-g', '-f', fmt, ...(S.js || []), ...extra, ...(S.cookies || []), '--', target])
    let out = '', err = ''
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('yt-dlp tardó demasiado')) }, ms)
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err = (err + d).slice(-1500)))
    p.on('error', e => { clearTimeout(t); reject(e) })
    p.on('close', code => {
      clearTimeout(t)
      const u = out.split('\n').map(s => s.trim()).find(s => /^https?:\/\//.test(s))
      if (u) resolve(u)
      else reject(new Error(err.trim().split('\n').pop() || 'yt-dlp falló (' + code + ')'))
    })
  })
}

async function check(o) {
  const ua = o.ua || UA
  const r = await fetch(o.url, { headers: { Range: 'bytes=0-1', 'User-Agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(6000) })
  const ct = r.headers.get('content-type') || ''
  const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/)
  try { if (r.body) await r.body.cancel() } catch {}
  if (r.status !== 200 && r.status !== 206) throw new Error('HTTP ' + r.status)
  if (/mpegurl/i.test(ct) || /\.m3u8/.test(o.url)) throw new Error('formato HLS no soportado')
  if (!/audio|video|octet-stream/i.test(ct)) throw new Error('no es audio (' + ct.slice(0, 30) + ')')
  return { url: o.url, ct, ua, total: m ? +m[1] : 0 }
}

function order(list) {
  const rank = a => (a.last ? 2 : sh.cooling(a.name) ? 1 : 0)
  return list.sort((a, b) => rank(a) - rank(b) || sh.score(b.name, b.base) - sh.score(a.name, a.base))
}

async function attempt(a, trace) {
  const t0 = Date.now()
  try {
    const raw = await a.fn()
    const v = await check(typeof raw === 'string' ? { url: raw } : raw)
    const ms = Date.now() - t0
    sh.rec(a.name, true, ms)
    trace.push({ metodo: a.name, ok: true, ms })
    return v
  } catch (e) {
    sh.rec(a.name, false, Date.now() - t0, errMsg(e))
    trace.push({ metodo: a.name, ok: false, ms: Date.now() - t0, error: errMsg(e).slice(0, 160) })
    console.log('⚠', a.name, '→', errMsg(e))
    throw e
  }
}
const firstOf = ps => new Promise((resolve, reject) => {
  let left = ps.length
  if (!left) return reject(new Error('sin métodos'))
  ps.forEach(p => p.then(resolve, () => { if (--left === 0) reject(new Error('todos fallaron')) }))
})

async function resolve(id, su, title, trace, fresh) {
  const key = keyOf(id, su)
  if (fresh) cache.delete(key)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < TTL) { trace.push({ metodo: 'caché', ok: true }); return hit.v }
  await ready

  const att = []
  if (id) {
    const yt = 'https://youtu.be/' + id
    if (RELAY) att.push({ name: 'relay', base: 90, fn: async () => ({ url: RELAY + '/api/stream?id=' + id }) })
    for (const c of IT) att.push({ name: 'youtube-' + c.name, base: 60, fn: () => innertube(id, c) })
    for (const b of sh.inv()) att.push({ name: 'invidious ' + host(b), base: 30, fn: async () => `${b}/latest_version?id=${id}&itag=140&local=true` })
    for (const b of sh.pip()) att.push({ name: 'piped ' + host(b), base: 20, fn: async () => {
      const j = await fetchJson(`${b}/streams/${id}`, 6000)
      const a = (j.audioStreams || []).find(x => /mp4/.test(x.mimeType || '')) || (j.audioStreams || [])[0]
      if (!a || !a.url) throw new Error('sin stream')
      return a.url
    } })
    att.push({ name: 'yt-dlp', base: 12, slow: true, fn: () => ytdlpUrl(yt, YT_FMT) })
    att.push({ name: 'yt-dlp(tv)', base: 10, slow: true, fn: () => ytdlpUrl(yt, YT_FMT, ['--extractor-args', 'youtube:player_client=tv']) })
    if (title) att.push({ name: 'soundcloud (respaldo)', base: 0, last: true, slow: true, fn: () => ytdlpUrl('scsearch1:' + title, SC_FMT) })
  } else att.push({ name: 'soundcloud', base: 0, last: true, slow: true, fn: () => ytdlpUrl(su, SC_FMT) })

  const ordered = order(att)
  const fastG = ordered.filter(a => !a.slow)
  const slowG = ordered.filter(a => a.slow)
  const deadline = Date.now() + 170000
  let found = null
  for (let i = 0; i < fastG.length && !found && Date.now() < deadline; i += 3) {
    try { found = await firstOf(fastG.slice(i, i + 3).map(a => attempt(a, trace))) } catch {}
  }
  for (const a of slowG) {
    if (found || Date.now() > deadline) break
    try { found = await attempt(a, trace) } catch {}
  }
  if (!found) {
    const errors = trace.map(x => x.error || '').join(' | ')
    if (isBotChallenge(errors)) throw Object.assign(new Error('YouTube está pidiendo iniciar sesión para verificar el tráfico. No pude obtener el audio y la conversión a M4A/nota de voz no llegó a empezar.'), { code: 'YOUTUBE_BOT_CHALLENGE' })
    throw new Error('No pude reproducir (' + trace.length + ' métodos fallaron). ' + ((trace[0] && trace[0].error) || ''))
  }
  cache.set(key, { t: Date.now(), v: found })
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  console.log('✅ audio listo')
  return found
}

// ───── descarga rápida en tramos paralelos ─────
async function fetchRange(src, a, b) {
  const r = await fetch(src.url, { headers: { 'User-Agent': src.ua || UA, Range: 'bytes=' + a + '-' + b }, redirect: 'follow', signal: AbortSignal.timeout(60000) })
  if (r.status !== 206) throw new Error('rango no soportado (' + r.status + ')')
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length !== b - a + 1) throw new Error('rango incompleto')
  return buf
}
async function downloadSingle(src) {
  const r = await fetch(src.url, { headers: { 'User-Agent': src.ua || UA }, redirect: 'follow', signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const chunks = []
  let n = 0
  for await (const c of r.body) {
    n += c.length
    if (n > CAP) throw new Error('El audio supera el límite de 30 MB')
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}
async function download(src) {
  const total = src.total
  if (total > CAP) throw new Error('El audio supera el límite de 30 MB')
  if (total > 400 * 1024) {
    const N = total > 3 * 1024 * 1024 ? 8 : 4
    const size = Math.ceil(total / N)
    try {
      const parts = await Promise.all(Array.from({ length: N }, (_, i) => fetchRange(src, i * size, Math.min(total - 1, (i + 1) * size - 1))))
      return Buffer.concat(parts)
    } catch (e) { console.log('⚠ descarga paralela falló:', errMsg(e), '→ descarga simple') }
  }
  return downloadSingle(src)
}

// audio(id de YouTube, link de SoundCloud, título) → { buf, ct }
async function audio(id, su, title) {
  const trace = []
  const t0 = Date.now()
  let src = await resolve(id, su, title, trace, false)
  const t1 = Date.now()
  let buf
  try { buf = await download(src) } catch (e) {
    if (/límite de 30 MB/.test(errMsg(e))) throw e
    console.log('⚠ link guardado falló →', errMsg(e))
    src = await resolve(id, su, title, trace, true)
    buf = await download(src)
  }
  console.log('⏱ link ' + (t1 - t0) + ' ms | descarga ' + (Date.now() - t1) + ' ms | ' + (buf.length / 1048576).toFixed(1) + ' MB')
  return { buf, ct: src.ct || '' }
}

module.exports = { audio }
