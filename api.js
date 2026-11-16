const { Readable } = require('stream')
const C = require('./core')
const { S, ready, errMsg, host, fetchJson, ytdlpLines, startYtdlp, openHttp, INVIDIOUS, PIPED, CLIENTS } = C

const MAX_SECONDS = 15 * 60
const YT_FMT = 'bestaudio[ext=m4a]/140'
const SC_FMT = 'http_mp3/bestaudio[protocol^=http]/bestaudio'
const YTM = 'https://music.youtube.com/youtubei/v1/'
const SONGS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF'
const BY_DATE = 'CAISAhAB'

const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}
const fmt = s => { s = Math.round(Number(s) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const toSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)

const cache = new Map()
async function cached(key, ms, fn) {
  const h = cache.get(key)
  if (h && Date.now() - h.t < ms) return h.v
  const v = await fn()
  if (Array.isArray(v) && !v.length) return v
  cache.set(key, { t: Date.now(), v })
  if (cache.size > 100) cache.delete(cache.keys().next().value)
  return v
}

// ───────── YouTube Music (acceso no oficial) ─────────
const ytmCtx = { client: { clientName: 'WEB_REMIX', clientVersion: '1.20251105.03.00', hl: 'es', gl: 'AR' } }
const ytmPost = (ep, body) => fetchJson(YTM + ep + '?prettyPrint=false', 9000, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com', Referer: 'https://music.youtube.com/', 'Accept-Language': 'es-419,es;q=0.9' },
  body: JSON.stringify({ context: ytmCtx, ...body })
})

const findVid = o => {
  if (!o || typeof o !== 'object') return null
  if (typeof o.videoId === 'string' && o.videoId.length === 11) return o.videoId
  for (const k in o) { const r = findVid(o[k]); if (r) return r }
  return null
}
const runsOf = c => ((c && c.text && c.text.runs) || []).map(r => r.text)
const isSep = s => /^\s*[•·]\s*$/.test(s)
const lastThumb = arr => (arr && arr.length ? arr[arr.length - 1].url : '')

function parseSongs(j, limit = 25) {
  const out = [], seen = new Set()
  const walk = o => {
    if (!o || typeof o !== 'object' || out.length >= limit) return
    const it = o.musicResponsiveListItemRenderer
    if (it) {
      const id = findVid(it)
      const cols = it.flexColumns || []
      const title = runsOf(cols[0] && cols[0].musicResponsiveListItemFlexColumnRenderer).join('')
      let parts = runsOf(cols[1] && cols[1].musicResponsiveListItemFlexColumnRenderer).filter(s => !isSep(s))
      const dur = parts.find(s => /^\d+:\d{2}(:\d{2})?$/.test(s))
      parts = parts.filter(s => s !== dur)
      if (parts.length >= 2 && /^(Canción|Song|Video|Videoclip|Single|EP)$/i.test(parts[0])) parts.shift()
      const secs = dur ? toSec(dur) : 0
      const th = lastThumb(it.thumbnail && it.thumbnail.musicThumbnailRenderer && it.thumbnail.musicThumbnailRenderer.thumbnail && it.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails)
      if (id && title && !seen.has(id) && (!secs || (secs > 20 && secs <= MAX_SECONDS))) {
        seen.add(id)
        out.push({ id, title, by: parts[0] || 'YouTube Music', img: th || 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', dur: dur || '' })
      }
      return
    }
    for (const k in o) walk(o[k])
  }
  walk(j)
  return out
}

function parseTwoRow(j, limit = 25) {
  const out = [], seen = new Set()
  const walk = o => {
    if (!o || typeof o !== 'object' || out.length >= limit) return
    const it = o.musicTwoRowItemRenderer
    if (it) {
      const id = findVid(it)
      const title = ((it.title && it.title.runs) || []).map(r => r.text).join('')
      const parts = ((it.subtitle && it.subtitle.runs) || []).map(r => r.text).filter(s => !isSep(s))
      const th = lastThumb(it.thumbnailRenderer && it.thumbnailRenderer.musicThumbnailRenderer && it.thumbnailRenderer.musicThumbnailRenderer.thumbnail && it.thumbnailRenderer.musicThumbnailRenderer.thumbnail.thumbnails)
      if (id && title && !seen.has(id)) {
        seen.add(id)
        out.push({ id, title, by: parts[0] || 'YouTube Music', img: th || 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', dur: '' })
      }
      return
    }
    for (const k in o) walk(o[k])
  }
  walk(j)
  return out
}

async function searchYTMusic(q) {
  return parseSongs(await ytmPost('search', { query: q, params: SONGS }))
}

// ───────── YouTube normal ─────────
async function searchYouTube(q, params) {
  const body = { context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'es', gl: 'AR' } }, query: q }
  if (params) body.params = params
  const j = await fetchJson('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', 8000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'es-419,es;q=0.9' },
    body: JSON.stringify(body)
  })
  const out = []
  const walk = o => {
    if (!o || typeof o !== 'object' || out.length >= 20) return
    if (o.videoRenderer) {
      const v = o.videoRenderer
      const secs = toSec(v.lengthText && v.lengthText.simpleText)
      if (v.videoId && secs > 20 && secs <= MAX_SECONDS) out.push({
        id: v.videoId,
        title: ((v.title && v.title.runs) || []).map(r => r.text).join('') || 'Sin título',
        by: (v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text) || 'YouTube',
        img: 'https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg',
        dur: fmt(secs)
      })
      return
    }
    for (const k in o) walk(o[k])
  }
  walk(j)
  return out
}

async function searchInvidious(q) {
  let last
  for (const b of INVIDIOUS) {
    try {
      const arr = await fetchJson(`${b}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, 4000)
      const out = (Array.isArray(arr) ? arr : []).filter(x => x.videoId && x.lengthSeconds > 20 && x.lengthSeconds <= MAX_SECONDS).slice(0, 20)
        .map(x => ({ id: x.videoId, title: x.title, by: x.author, img: 'https://i.ytimg.com/vi/' + x.videoId + '/hqdefault.jpg', dur: fmt(x.lengthSeconds) }))
      if (out.length) return out
    } catch (e) { last = e }
  }
  if (last) throw last
  return []
}

async function searchSoundcloud(q) {
  const rows = await ytdlpLines(['scsearch15:' + q])
  return rows.map(e => {
    const url = e.webpage_url || e.url
    if (!url || !/soundcloud\.com/.test(url)) return null
    const th = e.thumbnail || (e.thumbnails && e.thumbnails[e.thumbnails.length - 1] && e.thumbnails[e.thumbnails.length - 1].url) || ''
    return { id: url, u: url, title: e.title || 'Sin título', by: e.uploader || e.channel || 'SoundCloud', img: th, dur: e.duration ? fmt(e.duration) : '' }
  }).filter(Boolean)
}

// ───────── Buscar y novedades ─────────
async function search(q) {
  await ready
  const errors = []
  const [a, b] = await Promise.allSettled([searchYTMusic(q), searchYouTube(q)])
  const seen = new Set(), results = []
  for (const r of [a, b]) {
    if (r.status === 'rejected') { errors.push(errMsg(r.reason)); console.log('⚠ búsqueda →', errMsg(r.reason)); continue }
    for (const x of r.value) if (!seen.has(x.id) && results.length < 30) { seen.add(x.id); results.push(x) }
  }
  if (results.length) return { source: 'youtube', results }
  for (const [name, fn] of [['invidious', () => searchInvidious(q)], ['soundcloud', () => searchSoundcloud(q)]]) {
    try {
      const r = await fn()
      if (r && r.length) return { source: name, results: r }
      errors.push(name + ': sin resultados')
    } catch (e) { errors.push(name + ': ' + errMsg(e)); console.log('⚠ búsqueda', name, '→', errMsg(e)) }
  }
  throw new Error('No encontré resultados. ' + errors.join(' | ').slice(0, 250))
}

async function newReleases() {
  return cached('new', 180000, async () => {
    try {
      const j = await ytmPost('browse', { browseId: 'FEmusic_new_releases_videos' })
      const r = parseTwoRow(j)
      if (r.length >= 3) return r
    } catch (e) { console.log('⚠ novedades de YouTube Music →', errMsg(e)) }
    return searchYouTube('official audio', BY_DATE)
  })
}

// ───────── Reproducción (stream) ─────────
let active = null

function pipeOut(res, ctx, s, mime, source) {
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Accept-Ranges': 'none', 'X-Source': source })
  if (s.p) {
    ctx.killer = () => { try { s.p.kill('SIGKILL') } catch {} }
    res.write(s.first)
    s.p.stdout.pipe(res)
    const k = setTimeout(ctx.killer, 300000)
    s.p.on('close', () => clearTimeout(k))
  } else {
    ctx.killer = () => { try { s.ac.abort() } catch {} }
    const rs = Readable.fromWeb(s.r.body)
    rs.on('error', () => res.end())
    rs.pipe(res)
  }
}

async function stream(req, res, u) {
  const id = u.searchParams.get('id') || ''
  const su = u.searchParams.get('u') || ''
  const title = (u.searchParams.get('t') || '').replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 120)

  const attempts = []
  if (/^[\w-]{11}$/.test(id)) {
    const url = 'https://youtu.be/' + id
    attempts.push(['yt-dlp', () => startYtdlp(url, YT_FMT), 'audio/mp4'])
    for (const c of CLIENTS) attempts.push([`yt-dlp(${c})`, () => startYtdlp(url, YT_FMT, ['--extractor-args', 'youtube:player_client=' + c]), 'audio/mp4'])
    for (const b of INVIDIOUS) attempts.push([`invidious ${host(b)}`, () => openHttp(`${b}/latest_version?id=${id}&itag=140&local=true`), 'audio/mp4'])
    for (const b of PIPED) attempts.push([`piped ${host(b)}`, async () => {
      const j = await fetchJson(`${b}/streams/${id}`, 6000)
      const a = (j.audioStreams || []).find(x => /mp4/.test(x.mimeType || '')) || (j.audioStreams || [])[0]
      if (!a || !a.url) throw new Error('sin stream')
      return openHttp(a.url)
    }, 'audio/mp4'])
    if (title) attempts.push(['soundcloud (respaldo)', () => startYtdlp('scsearch1:' + title, SC_FMT), 'audio/mpeg'])
  } else if (/^https:\/\/([\w-]+\.)?soundcloud\.com\//.test(su)) {
    attempts.push(['soundcloud', () => startYtdlp(su, SC_FMT), 'audio/mpeg'])
  } else return send(res, 400, { error: 'Falta ?id= (YouTube) o ?u= (SoundCloud)' })

  await ready
  const ctx = { closed: false, killer: () => {} }
  if (active) { active.closed = true; active.killer() }
  active = ctx
  res.on('close', () => { ctx.closed = true; ctx.killer(); if (active === ctx) active = null })

  const errors = []
  const deadline = Date.now() + 70000
  for (const [name, fn, mime] of attempts) {
    if (ctx.closed) return
    if (Date.now() > deadline) { errors.push('tiempo agotado'); break }
    try {
      const s = await fn()
      if (ctx.closed) { try { s.p ? s.p.kill('SIGKILL') : s.ac.abort() } catch {} return }
      console.log('✅ stream por', name)
      return pipeOut(res, ctx, s, mime, name)
    } catch (e) { errors.push(`${name}: ${errMsg(e)}`); console.log('⚠', name, '→', errMsg(e)) }
  }
  if (!ctx.closed) send(res, 502, { error: 'No pude reproducir (' + errors.length + ' métodos fallaron). ' + (errors[0] || ''), details: errors })
}

// ───────── Diagnóstico ─────────
async function status() {
  await ready
  const out = { node: process.version, ytdlp: S.err || S.bin, cookies: S.cookies.length > 0 }
  const wt = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout ' + ms / 1000 + 's')), ms))])
  const tests = [
    ['busqueda-ytmusic', () => searchYTMusic('montagem apollo')],
    ['busqueda-youtube', () => searchYouTube('montagem apollo')],
    ['novedades', () => newReleases()],
    ['busqueda-soundcloud', () => searchSoundcloud('montagem apollo')],
    ['youtube-yt-dlp', () => ytdlpLines(['https://youtu.be/dQw4w9WgXcQ'], 25000)]
  ]
  for (const [name, fn] of tests) {
    const t0 = Date.now()
    try {
      const r = await wt(fn(), 28000)
      out[name] = { ok: !!(r && r.length), ms: Date.now() - t0, cantidad: r && r.length, ejemplo: r && r[0] && (r[0].title || r[0].id) }
    } catch (e) { out[name] = { ok: false, ms: Date.now() - t0, error: errMsg(e).slice(0, 200) } }
  }
  return out
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (!u.pathname.startsWith('/api/')) return false
  try {
    if (u.pathname === '/api/search') {
      const q = (u.searchParams.get('q') || '').trim().slice(0, 120)
      if (!q) return send(res, 400, { error: 'Falta ?q=' }), true
      send(res, 200, await cached('s:' + q.toLowerCase(), 120000, () => search(q)))
    } else if (u.pathname === '/api/new') {
      send(res, 200, { results: await newReleases() })
    } else if (u.pathname === '/api/stream') {
      await stream(req, res, u)
    } else if (u.pathname === '/api/status') {
      send(res, 200, await status())
    } else send(res, 404, { error: 'No existe' })
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: errMsg(e) })
  }
  return true
}

module.exports.h = { searchYTMusic, search }
