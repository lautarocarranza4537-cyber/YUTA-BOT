'use strict'
const { spawn } = require('child_process')
const CORE = require('./core')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const MAX_BYTES = 30 * 1024 * 1024
const MAX_QUERY = 160
const ID = /^[\w-]{11}$/

function resolveQuery(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_QUERY || /[\u0000-\u001f\u007f]/.test(raw)) throw new Error('Búsqueda inválida (máx. 160 caracteres)')
  const q = raw.trim()
  if (ID.test(q)) return { id: q, target: `https://www.youtube.com/watch?v=${q}` }
  if (/^https?:\/\//i.test(q)) {
    let u
    try { u = new URL(q) } catch { throw new Error('Enlace inválido') }
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) throw new Error('Solo se aceptan enlaces de YouTube')
    const parts = u.pathname.split('/').filter(Boolean)
    let id = host === 'youtu.be' ? parts[0] : u.searchParams.get('v')
    if (!id && ['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1]
    if (!ID.test(id || '')) throw new Error('No reconocí el ID del video de YouTube')
    return { id, target: `https://www.youtube.com/watch?v=${id}` }
  }
  if (q.startsWith('-')) throw new Error('Búsqueda inválida')
  return { id: null, target: `ytsearch1:${q}` }
}

async function getAudioMetadataAndStream(queryOrUrl) {
  const query = resolveQuery(queryOrUrl)
  await CORE.ready
  if (CORE.S.err) throw new Error('yt-dlp no está listo: ' + CORE.S.err)
  return new Promise((resolve, reject) => {
    const args = ['--no-playlist', '--no-warnings', '-j', '--max-downloads', '1', ...CORE.S.js, '--extractor-args', 'youtube:player_client=ios,android,web', '--', query.target]
    const p = spawn(CORE.S.bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = '', settled = false
    const done = (e, value) => { if (settled) return; settled = true; clearTimeout(timer); e ? reject(e) : resolve(value) }
    const timer = setTimeout(() => { p.kill('SIGKILL'); done(new Error('Timeout extrayendo metadatos')) }, 25000)
    p.stdout.on('data', d => { out += d; if (out.length > 1024 * 1024) { p.kill('SIGKILL'); done(new Error('Metadatos demasiado grandes')) } })
    p.stderr.on('data', d => { err = (err + d).slice(-1000) })
    p.on('error', e => done(e))
    p.on('close', code => {
      if (code !== 0) return done(new Error(err.trim().split('\n').pop() || 'No se pudo resolver el contenido de YouTube'))
      try {
        const info = JSON.parse(out.trim().split('\n')[0])
        if (!ID.test(info.id || '') || !Number.isFinite(Number(info.duration)) || Number(info.duration) > 12 * 60) return done(new Error('No encontré un audio válido (máx. 12 minutos)'))
        const formats = info.formats || []
        const audioFormat = formats.filter(f => f.acodec && f.acodec !== 'none' && f.vcodec === 'none' && (f.ext === 'm4a' || /^audio\/mp4/.test(f.mime_type || '')) && /^https?:\/\//.test(f.url || '')).sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
        if (!audioFormat) return done(new Error('YouTube no ofreció audio M4A compatible'))
        done(null, {
          id: info.id,
          title: String(info.title || 'Audio de YouTube').slice(0, 200),
          channel: String(info.uploader || info.channel || 'Desconocido').slice(0, 120),
          views: info.view_count ? Number(info.view_count).toLocaleString() : 'No disponible',
          likes: info.like_count ? Number(info.like_count).toLocaleString() : 'No disponible',
          year: info.upload_date ? String(info.upload_date).slice(0, 4) : 'Desconocido',
          thumbnail: `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
          url: `https://youtu.be/${info.id}`,
          directAudioUrl: audioFormat.url
        })
      } catch { done(new Error('Error analizando metadatos del video')) }
    })
  })
}

async function downloadBuffer(url) {
  let u
  try { u = new URL(url) } catch { throw new Error('Enlace de audio inválido') }
  if (u.protocol !== 'https:' || !/(^|\.)googlevideo\.com$/.test(u.hostname)) throw new Error('Host de audio no permitido')
  const res = await fetch(u, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60000) })
  if (!res.ok || !res.body) throw new Error('Error al descargar el flujo de audio (HTTP ' + res.status + ')')
  const ct = res.headers.get('content-type') || ''
  if (!/audio|video|octet-stream/i.test(ct)) throw new Error('El servidor devolvió un tipo de archivo inesperado')
  if (+res.headers.get('content-length') > MAX_BYTES) throw new Error('El archivo supera el límite de 30 MB')
  const chunks = []; let n = 0
  for await (const c of res.body) {
    n += c.length
    if (n > MAX_BYTES) { try { await res.body.cancel() } catch {}; throw new Error('El archivo supera el límite de 30 MB') }
    chunks.push(c)
  }
  if (!n) throw new Error('Audio vacío')
  return Buffer.concat(chunks)
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname !== '/api/stream' && u.pathname !== '/api/audio') return false
  const q = u.searchParams.get('q') || u.searchParams.get('id')
  if (!q) { res.writeHead(400); res.end('Falta parámetro q'); return true }
  try {
    const meta = await getAudioMetadataAndStream(q)
    const buf = await downloadBuffer(meta.directAudioUrl)
    res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Cache-Control': 'no-store', 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff' })
    res.end(buf)
  } catch (e) {
    if (!res.headersSent) { res.writeHead(/inválid|permitido|reconocí/.test(e.message) ? 400 : 502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(String(e.message).slice(0, 200)) }
  }
  return true
}

module.exports.resolveQuery = resolveQuery
module.exports.getAudioMetadataAndStream = getAudioMetadataAndStream
module.exports.downloadBuffer = downloadBuffer
