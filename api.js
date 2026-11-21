const { spawn } = require('child_process')
const { Readable } = require('stream')
const playMod = require('./play')
const social = require('./social')
const shield = require('./shield')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const startedAt = Date.now()
const json = (res, status, value, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra })
  res.end(JSON.stringify(value))
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')

  if (u.pathname === '/api/ping') {
    if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'Método no permitido' }, { Allow: 'GET' }); return true }
    json(res, 200, { ok: true, service: 'yuta-bot', uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), timestamp: new Date().toISOString() })
    return true
  }

  if (u.pathname === '/api/shield') {
    if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'Método no permitido' }, { Allow: 'GET' }); return true }
    try {
      const s = shield.status()
      const rows = Object.values(s.metodos || {})
      const recentlyWorking = rows.filter(x => x.ultimoOk && x.ultimoOk !== 'nunca').length
      const paused = rows.filter(x => String(x.estado || '').startsWith('en pausa')).length
      // Exponer solo agregados: no listar instancias, mensajes de error ni URLs de proveedores.
      json(res, 200, {
        ok: true,
        service: 'yuta-shield',
        available: recentlyWorking > 0,
        verdict: s.veredicto,
        methods: { known: rows.length, recentlyWorking, paused }
      })
    } catch {
      json(res, 503, { ok: false, service: 'yuta-shield', available: false, error: 'Estado de protección no disponible' })
    }
    return true
  }

  // API Endpoint para Streaming de Audio de YouTube (.play)
  if (u.pathname === '/api/stream' || u.pathname === '/api/audio') {
    const q = u.searchParams.get('q') || u.searchParams.get('id')
    if (!q) { res.writeHead(400); res.end('Falta parámetro q'); return true }
    
    try {
      const meta = await playMod.getAudioMetadataAndStream(q)
      res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Cache-Control': 'no-store' })
      const streamRes = await fetch(meta.directAudioUrl, { headers: { 'User-Agent': UA } })
      Readable.fromWeb(streamRes.body).pipe(res)
    } catch (e) {
      res.writeHead(500); res.end('Error en stream de audio')
    }
    return true
  }

  // API Endpoint para Descargas de Redes Sociales (TikTok, IG, FB)
  if (u.pathname === '/api/download') {
    const url = u.searchParams.get('url')
    const kind = u.searchParams.get('kind') || 'tt'
    if (!url) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Falta URL' })); return true }

    try {
      if (kind === 'tt') {
        const t = await social.tikwm(url)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, url: t.url, title: t.title, author: t.author }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, url, note: 'Procesado por API interna' }))
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return true
  }

  return false
}
