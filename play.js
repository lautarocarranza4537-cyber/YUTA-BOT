const { spawn } = require('child_process')
const { Readable } = require('stream')
const C = require('./core')
const { S, ready, errMsg, host, fetchJson, INVIDIOUS, PIPED, CLIENTS, UA } = C

const YT_FMT = 'bestaudio[ext=m4a]/140/bestaudio'
const SC_FMT = 'http_mp3/bestaudio[protocol^=http]/bestaudio'
const TTL = 20 * 60 * 1000
const cache = new Map()
const keyOf = (id, su) => (id ? 'y:' + id : 's:' + su)

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

// Link directo del audio (-g), sin descargar nada
function ytdlpUrl(target, fmt, extra = [], ms = 25000) {
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

// Comprueba que el link realmente entrega audio
async function check(url) {
  const r = await fetch(url, { headers: { Range: 'bytes=0-1', 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
  const ct = r.headers.get('content-type') || ''
  try { if (r.body) await r.body.cancel() } catch {}
  if (r.status !== 200 && r.status !== 206) throw new Error('HTTP ' + r.status)
  if (/mpegurl/i.test(ct) || /\.m3u8/.test(url)) throw new Error('formato HLS no soportado')
  if (!/audio|video|octet-stream/i.test(ct)) throw new Error('no es audio (' + ct.slice(0, 30) + ')')
  return { url, ct }
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
    att.push(['yt-dlp', () => ytdlpUrl(yt, YT_FMT)])
    for (const c of CLIENTS) att.push([`yt-dlp(${c})`, () => ytdlpUrl(yt, YT_FMT, ['--extractor-args', 'youtube:player_client=' + c])])
    for (const b of INVIDIOUS) att.push([`invidious ${host(b)}`, async () => `${b}/latest_version?id=${id}&itag=140&local=true`])
    for (const b of PIPED) att.push([`piped ${host(b)}`, async () => {
      const j = await fetchJson(`${b}/streams/${id}`, 6000)
      const a = (j.audioStreams || []).find(x => /mp4/.test(x.mimeType || '')) || (j.audioStreams || [])[0]
      if (!a || !a.url) throw new Error('sin stream')
      return a.url
    }])
    if (title) att.push(['soundcloud (respaldo)', () => ytdlpUrl('scsearch1:' + title, SC_FMT)])
  } else att.push(['soundcloud', () => ytdlpUrl(su, SC_FMT)])

  const deadline = Date.now() + 70000
  for (const [name, fn] of att) {
    if (Date.now() > deadline) { trace.push({ metodo: name, ok: false, error: 'tiempo agotado' }); break }
    const t0 = Date.now()
    try {
      const v = await check(await fn())
      trace.push({ metodo: name, ok: true, ms: Date.now() - t0 })
      cache.set(key, { t: Date.now(), v })
      if (cache.size > 200) cache.delete(cache.keys().next().value)
      console.log('✅ audio por', name)
      return v
    } catch (e) {
      trace.push({ metodo: name, ok: false, ms: Date.now() - t0, error: errMsg(e).slice(0, 160) })
      console.log('⚠', name, '→', errMsg(e))
    }
  }
  throw new Error('No pude reproducir (' + trace.length + ' métodos fallaron). ' + ((trace[0] && trace[0].error) || ''))
}

// Reenvía el audio al navegador, con soporte de saltos (Range)
async function proxy(req, res, src) {
  const headers = { 'User-Agent': UA }
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

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname !== '/api/stream' && u.pathname !== '/api/probe' && u.pathname !== '/api/diag') return false
  const id = u.searchParams.get('id') || ''
  const su = u.searchParams.get('u') || ''
  const title = (u.searchParams.get('t') || '').replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 120)
  const okId = /^[\w-]{11}$/.test(id)
  const okSu = /^https:\/\/([\w-]+\.)?soundcloud\.com\//.test(su)
  if (!okId && !okSu) { send(res, 400, { error: 'Falta ?id= (YouTube) o ?u= (SoundCloud)' }); return true }

  if (u.pathname === '/api/diag') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    res.write('Probando métodos, espera... (cada línea sale al terminar)\n\n')
    const tr = { n: 0, push(x) { this.n++; res.write((x.ok ? 'OK     ' : 'FALLÓ  ') + x.metodo + (x.error ? ' → ' + x.error : '') + '\n') }, get length() { return this.n } }
    try { await resolve(okId ? id : '', su, title, tr, true); res.write('\nRESULTADO: hay un método que funciona\n') }
    catch (e) { res.write('\nRESULTADO: ' + errMsg(e) + '\n') }
    res.end()
    return true
  }
  const trace = []
  try {
    const i = okId ? id : ''
    const src = await resolve(i, su, title, trace, false)
    if (u.pathname === '/api/probe') { send(res, 200, { ok: true, trace }); return true }
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
