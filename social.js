const { spawn } = require('child_process')
const C = require('./core')
const { S, ready, errMsg, UA } = C
const CAP = 40 * 1024 * 1024
const HOSTS = { tt: ['tiktok.com'], ig: ['instagram.com'], fb: ['facebook.com', 'fb.watch', 'fb.com', 'fb.me'] }

function hostOk(kind, u) {
  try {
    const x = new URL(u)
    if (!/^https?:$/.test(x.protocol)) return false
    const h = x.hostname.toLowerCase()
    return HOSTS[kind].some(d => h === d || h.endsWith('.' + d))
  } catch { return false }
}
function findUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i)
  return m ? m[0].replace(/[),.;!?]+$/, '') : ''
}

async function tikwm(url) {
const r = await fetch('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(url), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
  const j = await r.json().catch(() => ({}))
  if (!j || j.code !== 0 || !j.data) throw new Error((j && j.msg) || 'TikTok no respondió')
  const d = j.data
  if (Array.isArray(d.images) && d.images.length) throw new Error('Esa publicación son fotos, no un video.')
  const abs = u => (u && u.startsWith('/') ? 'https://www.tikwm.com' + u : u)
  const link = abs(d.hdplay || d.play)
  if (!link) throw new Error('No encontré el video')
  return {
    url: link, title: d.title || '', by: (d.author && (d.author.nickname || d.author.unique_id)) || '',
    dur: d.duration, views: d.play_count, date: d.create_time
  }
}

async function fetchBuf(url, headers) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(120000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  if ((+r.headers.get('content-length') || 0) > CAP) throw new Error('El video es muy pesado (máx 40 MB).')
  const chunks = []
  let n = 0
  for await (const c of r.body) {
    n += c.length
    if (n > CAP) throw new Error('El video es muy pesado (máx 40 MB).')
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

// Datos del video (y link directo) sin descargarlo todavía
function ytdlpInfo(url) {
  return new Promise((resolve, reject) => {
    if (S.err) return reject(new Error(S.err))
    const p = spawn(S.bin, ['--no-playlist', '--no-warnings', '--dump-json', '-f', 'b[ext=mp4]/b', ...S.js, ...S.cookies, '--', url])
    let out = '', err = ''
    const t = setTimeout(() => { try { p.kill('SIGKILL') } catch {} ; reject(new Error('Tardó demasiado en responder.')) }, 60000)
    p.stdout.on('data', d => { out += d; if (out.length > 4e6) { try { p.kill('SIGKILL') } catch {} } })
    p.stderr.on('data', d => (err = (err + d).slice(-1500)))
    p.on('error', e => { clearTimeout(t); reject(e) })
    p.on('close', code => {
      clearTimeout(t)
      try { return resolve(JSON.parse(out.trim().split('\n')[0])) } catch {}
      reject(new Error(err.trim().split('\n').pop() || 'yt-dlp falló (' + code + ')'))
    })
  })
}

function ytdlpBuf(url) {
  return new Promise((resolve, reject) => {
    if (S.err) return reject(new Error(S.err))
    const p = spawn(S.bin, ['--no-playlist', '--no-warnings', '-q', '--max-filesize', '40M', ...S.js, ...S.cookies, '-f', 'b[ext=mp4]/b', '-o', '-', '--', url])
    const chunks = []
    let n = 0, err = '', dead = false
    const kill = () => { dead = true; try { p.kill('SIGKILL') } catch {} }
    const t = setTimeout(() => { kill(); reject(new Error('Tardó demasiado en responder.')) }, 120000)
    p.stdout.on('data', d => {
      n += d.length
      if (n > CAP) { kill(); clearTimeout(t); return reject(new Error('El video es muy pesado (máx 40 MB).')) }
      chunks.push(d)
    })
    p.stderr.on('data', d => (err = (err + d).slice(-1500)))
    p.on('error', e => { clearTimeout(t); reject(e) })
    p.on('close', code => {
      clearTimeout(t)
      if (dead) return
      if (n > 0 && code === 0) return resolve(Buffer.concat(chunks))
      reject(new Error(err.trim().split('\n').pop() || 'yt-dlp falló (' + code + ')'))
    })
  })
}

function friendly(kind, e) {
  const m = errMsg(e)
  if (/fotos|muy pesado|Tardó/.test(m)) return m
  if (/login|log in|cookies|private|sign in|rate-limit|empty media/i.test(m)) {
    return kind === 'ig'
      ? 'Instagram pide iniciar sesión para ese video (puede ser privado o estar bloqueando al servidor).'
      : 'Ese video es privado o requiere iniciar sesión.'
  }
  if (/unsupported url/i.test(m)) return 'Ese link no es de un video.'
  if (/not found|404|unavailable|removed/i.test(m)) return 'No encontré ese video, puede haber sido borrado.'
  return m.slice(0, 160)
}

// Devuelve el video con sus datos: título, canal, duración, vistas y fecha
async function video(kind, url) {
  await ready
  if (kind === 'tt') {
    try {
      const t = await tikwm(url)
      return { buf: await fetchBuf(t.url), title: t.title, by: t.by, dur: t.dur, views: t.views, date: t.date, via: 'tikwm' }
    } catch (e) {
      console.log('⚠ tikwm →', errMsg(e))
      if (/fotos/.test(errMsg(e))) throw e
    }
  }
  const info = await ytdlpInfo(url)
  const meta = {
    title: String(info.title || info.description || '').split('\n')[0].slice(0, 120),
    by: info.uploader || info.channel || info.uploader_id || '',
    dur: info.duration, views: info.view_count, date: info.timestamp || info.upload_date
  }
  let buf = null, via = 'yt-dlp'
  const direct = info.url && !/\.m3u8/.test(info.url) && (!info.protocol || /^https?$/.test(info.protocol))
  if (direct) {
    try { buf = await fetchBuf(info.url, info.http_headers); via = 'yt-dlp (directo)' }
    catch (e) { console.log('⚠ link directo falló →', errMsg(e)); if (/pesado/.test(errMsg(e))) throw e }
  }
  if (!buf) buf = await ytdlpBuf(url)
  return { ...meta, buf, via }
}

module.exports = { video, findUrl, hostOk, friendly }
