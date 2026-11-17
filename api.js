const { Readable } = require('stream')
const C = require('./core')
const { S, ready, errMsg, host, fetchJson, ytdlpLines, startYtdlp, openHttp, INVIDIOUS, PIPED, CLIENTS } = C

const MAX_SECONDS = 20 * 60
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
  const n = Array.isArray(v) ? v.length : (v && v.results ? v.results.length : 0)
  if (n) {
    cache.set(key, { t: Date.now(), v })
    if (cache.size > 100) cache.delete(cache.keys().next().value)
  }
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

function parseSongs(j, limit = 30) {
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

function parseTwoRow(j, limit = 30) {
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

const searchYTMusic = async q => parseSongs(await ytmPost('search', { query: q, params: SONGS }))

// ───────── YouTube normal (con paginación) ─────────
async function ytPage(q, token, params) {
  const ctx = { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'es', gl: 'AR' } }
  const body = token ? { context: ctx, continuation: token } : { context: ctx, query: q, ...(params ? { params } : {}) }
  const j = await fetchJson('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', 9000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'es-419,es;q=0.9' },
    body: JSON.stringify(body)
  })
  const items = []
  let next = null
  const walk = o => {
    if (!o || typeof o !== 'object') return
    if (o.videoRenderer) {
      const v = o.videoRenderer
      const secs = toSec(v.lengthText && v.lengthText.simpleText)
      if (v.videoId && secs > 20 && secs <= MAX_SECONDS) items.push({
        id: v.videoId,
        title: ((v.title && v.title.runs) || []).map(r => r.text).join('') || 'Sin título',
        by: (v.ownerText && v.ownerText.runs && v.ownerText.runs[0] && v.ownerText.runs[0].text) || 'YouTube',
        img: 'https://i.ytimg.com/vi/' + v.videoId + '/hqdefault.jpg',
        dur: fmt(secs)
      })
      return
    }
    if (o.continuationCommand && o.continuationCommand.token && !next) { next = o.continuationCommand.token; return }
    for (const k in o) walk(o[k])
  }
  walk(j)
  return { items, next }
}
const searchYouTube = async (q, params) => (await ytPage(q, null, params)).items

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

// ───────── Buscar, novedades ─────────
async function fallback(q) {
  const errors = []
  for (const [name, fn] of [['invidious', () => searchInvidious(q)], ['soundcloud', () => searchSoundcloud(q)]]) {
    try {
      const r = await fn()
      if (r && r.length) return r
      errors.push(name + ': sin resultados')
    } catch (e) { errors.push(name + ': ' + errMsg(e)); console.log('⚠ respaldo', name, '→', errMsg(e)) }
  }
  throw new Error('No encontré resultados. ' + errors.join(' | ').slice(0, 250))
}

async function find(q, token) {
  if (token) {
    const p = await ytPage(q, token)
    return { results: p.items, next: p.next }
  }
  const [a, b] = await Promise.allSettled([searchYTMusic(q), ytPage(q)])
  const seen = new Set(), results = []
  const add = x => { if (!seen.has(x.id)) { seen.add(x.id); results.push(x) } }
  if (a.status === 'fulfilled') a.value.forEach(add); else console.log('⚠ YouTube Music →', errMsg(a.reason))
  if (b.status === 'fulfilled') b.value.items.forEach(add); else console.log('⚠ YouTube →', errMsg(b.reason))
  const next = b.status === 'fulfilled' ? b.value.next : null
  if (!results.length) return { results: await fallback(q), next: null }
  return { results, next }
}

async function newReleases() {
  return cached('new', 180000, async () => {
    try {
      const r = parseTwoRow(await ytmPost('browse', { browseId: 'FEmusic_new_releases_videos' }))
      if (r.length >= 3) return r
    } catch (e) { console.log('⚠ novedades de YouTube Music →', errMsg(e)) }
    return searchYouTube('official audio', BY_DATE)
  })
}

// ───────── Reproducción (stream, una a la vez) ─────────
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

// ───────── Rutas ─────────
module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (!u.pathname.startsWith('/api/')) return false
  try {
    const p = u.pathname
    const q = (u.searchParams.get('q') || '').trim().slice(0, 120)
    if (p === '/api/ping') {
      send(res, 200, { ok: true, version: 3, ytdlp: S.err || S.bin })
    } else if (p === '/api/find' || p === '/api/search') {
      const t = (u.searchParams.get('t') || '').slice(0, 2000)
      if (!q) send(res, 400, { error: 'Falta ?q=' })
      else { await ready; send(res, 200, await cached('f:' + q.toLowerCase() + ':' + t.slice(-30), 120000, () => find(q, t))) }
    } else if (p === '/api/suggest') {
      let list = []
      if (q) {
        try {
          const arr = await fetchJson('https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=es&q=' + encodeURIComponent(q), 4000)
          list = (arr[1] || []).slice(0, 8)
        } catch (e) {}
      }
      send(res, 200, { suggestions: list })
    } else if (p === '/api/new') {
      send(res, 200, { results: await newReleases() })
    } else if (p === '/api/stream') {
      await stream(req, res, u)
    } else if (p === '/api/status') {
      send(res, 200, await status())
    } else send(res, 404, { error: 'No existe' })
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: errMsg(e) })
  }
  return true
}

module.exports.h = { searchYTMusic, ytPage, fallback }
