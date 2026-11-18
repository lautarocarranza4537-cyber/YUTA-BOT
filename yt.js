const fs = require('fs')
const { spawn } = require('child_process')
const C = require('./core')
const H = require('./wacore')
const sh = require('./shield')
const { S, errMsg, UA } = C

const IT = [
  { name: 'vr', id: 28, ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L', hl: 'en', gl: 'US' } },
  { name: 'ios', id: 5, ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
    ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en', gl: 'US' } },
  { name: 'android', id: 3, ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, osName: 'Android', osVersion: '11', hl: 'en', gl: 'US' } }
]

async function player(id, c) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': String(c.id), 'X-YouTube-Client-Version': c.ctx.clientVersion, Origin: 'https://www.youtube.com' },
    body: JSON.stringify({ context: { client: c.ctx }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
    signal: AbortSignal.timeout(10000)
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

async function nextInfo(id) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept-Language': 'es-419,es;q=0.9' },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'es', gl: 'AR' } }, videoId: id }),
    signal: AbortSignal.timeout(9000)
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const j = await r.json()
  const out = {}
  const walk = o => {
    if (!o || typeof o !== 'object') return
    const vc = o.videoViewCountRenderer && o.videoViewCountRenderer.viewCount
    if (vc && out.views == null) {
      const n = String(vc.simpleText || (vc.runs || []).map(x => x.text).join('')).replace(/\D/g, '')
      if (n) out.views = +n
    }
    if (o.dateText && o.dateText.simpleText && !out.dateText) out.dateText = o.dateText.simpleText
    if (o.videoOwnerRenderer && !out.by) {
      const t = o.videoOwnerRenderer.title
      out.by = t && t.runs && t.runs[0] && t.runs[0].text
    }
    for (const k in o) walk(o[k])
  }
  walk(j)
  return out
}

async function details(id) {
  const [p, n] = await Promise.allSettled([
    (async () => {
      for (const c of IT) { try { const j = await player(id, c); if (j.videoDetails) return j } catch {} }
      throw new Error('sin datos')
    })(),
    nextInfo(id)
  ])
  const j = p.status === 'fulfilled' ? p.value : null
  const nx = n.status === 'fulfilled' ? n.value : {}
  const d = j && j.videoDetails
  const mf = j && j.microformat && j.microformat.playerMicroformatRenderer
  if (!d && !nx.by) return null
  return {
    title: d && d.title,
    by: (d && d.author) || nx.by,
    seconds: d ? +d.lengthSeconds : 0,
    views: d && d.viewCount != null ? +d.viewCount : nx.views,
    date: (mf && (mf.publishDate || mf.uploadDate)) || nx.dateText || ''
  }
}

// ───── video con audio (play2) ─────
// Junta las opciones de todos los clientes de YouTube, de mejor a peor
async function plans(id, maxH, cap) {
  const mux = [], prog = []
  let last = null
  for (const c of IT) {
    try {
      const j = await player(id, c)
      const st = j.playabilityStatus
      if (st && st.status && st.status !== 'OK') throw new Error(String(st.reason || st.status).slice(0, 120))
      const sd = j.streamingData || {}
      const ad = sd.adaptiveFormats || []
      const audio = ad.filter(f => /^audio\/mp4/.test(f.mimeType || '') && f.url)
      const a = audio.find(f => f.itag === 140) || audio.sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0))[0]
      if (a) {
        const vids = ad.filter(f => /^video\/mp4/.test(f.mimeType || '') && /avc1/.test(f.mimeType) && f.url && f.height && f.height <= maxH)
          .sort((x, y) => y.height - x.height || (y.bitrate || 0) - (x.bitrate || 0))
        for (const x of vids) {
          const size = (+x.contentLength || 0) + (+a.contentLength || 0)
          if (!size || size <= cap) { mux.push({ kind: 'mux', client: c.name, v: x, a, ua: c.ua, height: x.height }); break }
        }
      }
      const p = (sd.formats || []).filter(f => /^video\/mp4/.test(f.mimeType || '') && f.url && f.height && f.height <= maxH).sort((x, y) => y.height - x.height)[0]
      if (p) prog.push({ kind: 'prog', client: c.name, v: p, ua: c.ua, height: p.height })
    } catch (e) { last = e }
  }
  const all = [...mux.sort((x, y) => y.height - x.height), ...prog.sort((x, y) => y.height - x.height)]
  if (!all.length) throw last || new Error('sin formatos de video')
  return all
}

async function getTotal(url, ua) {
  const r = await fetch(url, { headers: { 'User-Agent': ua, Range: 'bytes=0-1' }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '')
  try { if (r.body) await r.body.cancel() } catch {}
  if (r.status !== 206 && r.status !== 200) throw new Error('HTTP ' + r.status)
  return m ? +m[1] : (+r.headers.get('content-length') || 0)
}

// Pide un tramo: primero con el encabezado Range y, si falla, con el parámetro range de la URL
async function fetchRange(url, ua, a, b) {
  const want = b - a + 1
  const tries = [
    () => fetch(url, { headers: { 'User-Agent': ua, Range: 'bytes=' + a + '-' + b }, redirect: 'follow', signal: AbortSignal.timeout(90000) }),
    () => fetch(url + (url.includes('?') ? '&' : '?') + 'range=' + a + '-' + b, { headers: { 'User-Agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(90000) })
  ]
  let last = new Error('sin respuesta')
  for (const t of tries) {
    try {
      const r = await t()
      if (r.status !== 206 && r.status !== 200) throw new Error('HTTP ' + r.status)
      const len = +r.headers.get('content-length') || 0
      if (len && len > want * 1.5) { try { await r.body.cancel() } catch {} throw new Error('el servidor ignoró el rango') }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length !== want) throw new Error('rango incompleto')
      return buf
    } catch (e) { last = e }
  }
  throw last
}

async function dl(url, ua, total, cap) {
 if (!total) total = await getTotal(url, ua)
  if (!total) throw new Error('tamaño desconocido')
  if (total > cap) throw new Error('El video es muy pesado')
  const n = total > 12 * 1048576 ? 6 : total > 3 * 1048576 ? 4 : 1
  const size = Math.ceil(total / n)
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => fetchRange(url, ua, i * size, Math.min(total - 1, (i + 1) * size - 1))))
  const buf = Buffer.concat(parts)
  if (buf.length !== total) throw new Error('descarga incompleta')
  return buf
}

async function mux(vbuf, abuf) {
  const vi = H.tmp('mp4'), ai = H.tmp('m4a'), out = H.tmp('mp4')
  fs.writeFileSync(vi, vbuf)
  fs.writeFileSync(ai, abuf)
  try {
    await H.ff(['-i', vi, '-i', ai, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', out], 120000)
    return fs.readFileSync(out)
  } finally { H.rm(vi, ai, out) }
}

async function getBuf(url, cap) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(90000) })
  if (!r.ok || !r.body) throw new Error('HTTP ' + r.status)
  if (!/video|octet-stream/i.test(r.headers.get('content-type') || '')) throw new Error('no es video')
  if ((+r.headers.get('content-length') || 0) > cap) throw new Error('El video es muy pesado')
  const chunks = []
  let n = 0
  for await (const c of r.body) { n += c.length; if (n > cap) throw new Error('El video es muy pesado'); chunks.push(c) }
  return Buffer.concat(chunks)
}

// Respaldo: Piped e Invidious (calidad media, con audio)
async function viaProxies(id, maxH, cap) {
  const deadline = Date.now() + 70000
  let last = null
  for (const b of sh.pip()) {
    if (Date.now() > deadline) break
    try {
      const j = await C.fetchJson(`${b}/streams/${id}`, 7000)
      const v = (j.videoStreams || []).filter(s => !s.videoOnly && /mp4/.test(s.mimeType || '') && s.url)
        .sort((x, y) => (y.height || 0) - (x.height || 0)).find(s => !s.height || s.height <= maxH)
      if (!v) throw new Error('sin formato')
      return { buf: await getBuf(v.url, cap), height: v.height || 360, via: 'piped' }
    } catch (e) { last = e }
  }
  for (const b of sh.inv()) {
    for (const itag of [22, 18]) {
      if (Date.now() > deadline) break
      try { return { buf: await getBuf(`${b}/latest_version?id=${id}&itag=${itag}&local=true`, cap), height: itag === 22 ? 720 : 360, via: 'invidious' } }
      catch (e) { last = e }
    }
  }
  throw last || new Error('sin respuesta')
}

function viaYtdlp(id, maxH, cap) {
  return new Promise((resolve, reject) => {
    if (S.err) return reject(new Error(S.err))
    const base = H.tmp('x').slice(0, -2)
    const bin = H.ffbin()
    const args = ['--no-playlist', '--no-warnings', '-q', '--max-filesize', Math.floor(cap / 1048576) + 'M', ...S.js, ...S.cookies,
      '-f', 'bv*[height<=' + maxH + '][vcodec^=avc1]+ba[ext=m4a]/b[height<=' + maxH + '][ext=mp4]/b[ext=mp4]',
      '--merge-output-format', 'mp4', ...(bin && bin !== 'ffmpeg' ? ['--ffmpeg-location', bin] : []),
      '-o', base + '.%(ext)s', '--', 'https://youtu.be/' + id]
    const p = spawn(S.bin, args)
    let err = ''
    const t = setTimeout(() => { try { p.kill('SIGKILL') } catch {} }, 170000)
    p.stderr.on('data', d => (err = (err + d).slice(-1500)))
    p.on('error', e => { clearTimeout(t); reject(e) })
    p.on('close', code => {
      clearTimeout(t)
      const f = base + '.mp4'
      try {
        if (code === 0 && fs.existsSync(f)) { const buf = fs.readFileSync(f); H.rm(f); return resolve({ buf, height: maxH, via: 'yt-dlp' }) }
      } catch {}
      H.rm(f)
      reject(new Error(err.trim().split('\n').pop() || 'yt-dlp falló (' + code + ')'))
    })
  })
}

function friendly(errors) {
  const all = errors.join(' | ')
  if (/sign in|not a bot|confirm you|HTTP 403|HTTP 429|bot/i.test(all)) {
    return 'YouTube está bloqueando la descarga de videos desde este servidor ahora mismo. Prueba más tarde, o usa play para bajar solo el audio.'
  }
  return ('No pude descargar el video. ' + (errors[0] || '')).slice(0, 200)
}

async function video(id, maxH = 720, cap = 50 * 1048576) {
  const errors = []
  try {
    for (const p of await plans(id, maxH, cap)) {
      try {
        if (p.kind === 'prog') return { buf: await dl(p.v.url, p.ua, +p.v.contentLength || 0, cap), height: p.height, via: 'youtube-' + p.client }
        const [vb, ab] = await Promise.all([dl(p.v.url, p.ua, +p.v.contentLength || 0, cap), dl(p.a.url, p.ua, +p.a.contentLength || 0, cap)])
        return { buf: await mux(vb, ab), height: p.height, via: 'youtube-' + p.client }
      } catch (e) { errors.push(p.client + ': ' + errMsg(e)) }
    }
  } catch (e) { errors.push('clientes: ' + errMsg(e)) }
  try { return await viaProxies(id, maxH, cap) } catch (e) { errors.push('proxies: ' + errMsg(e)) }
  try { return await viaYtdlp(id, maxH, cap) } catch (e) { errors.push('yt-dlp: ' + errMsg(e)) }
  console.log('⚠ play2 falló →', errors.join(' | '))
  throw new Error(friendly(errors))
}

module.exports = { details, video }
