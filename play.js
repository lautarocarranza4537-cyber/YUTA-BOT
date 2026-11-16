const { spawn } = require('child_process')
const { Readable } = require('stream')
const C = require('./core')
const sh = require('./shield')
const { S, ready, errMsg, host, fetchJson, UA } = C

const YT_FMT = 'bestaudio[ext=m4a]/140/bestaudio'
const SC_FMT = 'http_mp3/bestaudio[protocol^=http]/bestaudio'
const TTL = 20 * 60 * 1000
const RELAY = (process.env.RELAY_URL || '').replace(/\/+$/, '')
const cache = new Map()
const keyOf = (id, su) => (id ? 'y:' + id : 's:' + su)

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj, null, 2))
}

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
    if (S.err) return reject(new Error(S.err))
    const p = spawn(S.bin, ['--no-playlist', '--no-warnings', '-q', '-g', '-f', fmt, ...S.js, ...extra, ...S.cookies, '--', target])
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
  const r = await fetch(o.url, { headers: { Range: 'bytes=0-1', 'User-Agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
  const ct = r.headers.get('content-type') || ''
  try { if (r.body) await r.body.cancel() } catch {}
  if (r.status !== 200 && r.status !== 206) throw new Error('HTTP ' + r.status)
  if (/mpegurl/i.test(ct) || /\.m3u8/.test(o.url)) throw new Error('formato HLS no soportado')
  if (!/audio|video|octet-stream/i.test(ct)) throw new Error('no es audio (' + ct.slice(0, 30) + ')')
  return { url: o.url, ct, ua }
}

// Orden adaptativo: primero lo que funciona, al final lo que está en pausa; SoundCloud siempre al final
function order(list) {
  const rank = a => (a.last ? 2 : sh.cooling(a.name) ? 1 : 0)
  return list.sort((a, b) => rank(a) - rank(b) || sh.score(b.name, b.base) - sh.score(a.name, a.base))
}

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
    att.push({ name: 'yt-dlp', base: 12, fn: () => ytdlpUrl(yt, YT_FMT) })
    att.push({ name: 'yt-dlp(tv)', base: 10, fn: () => ytdlpUrl(yt, YT_FMT, ['--extractor-args', 'youtube:player_client=tv']) })
    if (title) att.push({ name: 'soundcloud (respaldo)', base: 0, last: true, fn: () => ytdlpUrl('scsearch1:' + title, SC_FMT) })
  } else att.push({ name: 'soundcloud', base: 0, last: true, fn: () => ytdlpUrl(su, SC_FMT) })

  const deadline = Date.now() + 170000
  for (const a of order(att)) {
    if (Date.now() > deadline) { trace.push({ metodo: a.name, ok: false, error: 'tiempo agotado' }); break }
    const t0 = Date.now()
    try {
      const raw = await a.fn()
      const v = await check(typeof raw === 'string' ? { url: raw } : raw)
      const ms = Date.now() - t0
      sh.rec(a.name, true, ms)
      trace.push({ metodo: a.name, ok: true, ms })
      cache.set(key, { t: Date.now(), v })
      if (cache.size > 200) cache.delete(cache.keys().next().value)
      console.log('✅ audio por', a.name)
      return v
    } catch (e) {
      sh.rec(a.name, false, Date.now() - t0, errMsg(e))
      trace.push({ metodo: a.name, ok: false, ms: Date.now() - t0, error: errMsg(e).slice(0, 160) })
      console.log('⚠', a.name, '→', errMsg(e))
    }
  }
  throw new Error('No pude reproducir (' + trace.length + ' métodos fallaron). ' + ((trace[0] && trace[0].error) || ''))
}

async function proxy(req, res, src) {
  const headers = { 'User-Agent': src.ua || UA }
  if (req.headers.range) headers.Range = req.headers.range
  const ac = new AbortController()
  res.on('close', () => ac.abort())
  const r = await fetch(src.url, { headers, redirect: 'follow', signal: ac.signal })
  if (r.status !== 200 && r.status !== 206) throw new Error('HTTP ' + r.status)
  const h = { 'Content-Type': r.headers.get('content-type') || 'audio/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  for (const k of ['content-length', 'content-range']) { const v = r.headers.get(k); if (v) h[k] = v }
  res.writeHead(r.status, h)
  Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res)
}

// Chequeo propio cada 15 min (mantiene las estadísticas al día)
let checking = false
async function selfCheck() {
  if (checking) return
  checking = true
  try { await resolve('dQw4w9WgXcQ', '', '', [], true) } catch {}
  checking = false
}
setTimeout(selfCheck, 90000)
setInterval(selfCheck, 15 * 60000).unref()

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  const p = u.pathname
  if (p === '/api/shield') { send(res, 200, sh.status()); return true }
  if (p !== '/api/stream' && p !== '/api/probe' && p !== '/api/diag') return false
  const id = u.searchParams.get('id') || ''
  const su = u.searchParams.get('u') || ''
  const title = (u.searchParams.get('t') || '').replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 120)
  const okId = /^[\w-]{11}$/.test(id)
  const okSu = /^https:\/\/([\w-]+\.)?soundcloud\.com\//.test(su)
  if (!okId && !okSu) { send(res, 400, { error: 'Falta ?id= (YouTube) o ?u= (SoundCloud)' }); return true }

  if (p === '/api/diag') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    res.write('Probando métodos, espera... (cada línea sale al terminar)\n\n')
    const tr = { n: 0, push(x) { this.n++; res.write((x.ok ? 'OK     ' : 'FALLÓ  ') + x.metodo + (x.ms ? ' (' + x.ms + ' ms)' : '') + (x.error ? ' → ' + x.error : '') + '\n') }, get length() { return this.n } }
    try { await resolve(okId ? id : '', su, title, tr, true); res.write('\nRESULTADO: hay un método que funciona\n') }
    catch (e) { res.write('\nRESULTADO: ' + errMsg(e) + '\n') }
    res.end()
    return true
  }

  const trace = []
  try {
    const i = okId ? id : ''
    const src = await resolve(i, su, title, trace, false)
    if (p === '/api/probe') { send(res, 200, { ok: true, trace }); return true }
    try {
      await proxy(req, res, src)
    } catch (e) {
      if (res.headersSent) return true
      console.log('⚠ el link guardado falló, busco otro →', errMsg(e))
      const src2 = await resolve(i, su, title, trace, true)
      await proxy(req, res, src2)
    }
  } catch (e) {
    if (!res.headersSent) send(res, 502, { ok: false, error: errMsg(e), trace })
  }
  return true
}
