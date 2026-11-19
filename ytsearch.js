// Búsqueda de canciones y videos (YouTube Music, YouTube y respaldos). No depende de api.js.
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
let C = {}
try { C = require('./core') } catch {}
const errMsg = C.errMsg || (e => (e && e.message) || String(e))
const INVIDIOUS = C.INVIDIOUS || ['https://inv.nadeko.net', 'https://yewtu.be', 'https://invidious.nerdvpn.de']
const MAX_SECONDS = 20 * 60
const YTM = 'https://music.youtube.com/youtubei/v1/'
const SONGS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF'

const fmt = s => { s = Math.round(Number(s) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const toSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)

async function fj(u, ms = 8000, opts = {}) {
  const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(ms), headers: { 'User-Agent': UA, ...(opts.headers || {}) } })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

// ───────── YouTube Music (acceso no oficial) ─────────
const ytmCtx = { client: { clientName: 'WEB_REMIX', clientVersion: '1.20251105.03.00', hl: 'es', gl: 'AR' } }
const ytmPost = (ep, body) => fj(YTM + ep + '?prettyPrint=false', 9000, {
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
const searchYTMusic = async q => parseSongs(await ytmPost('search', { query: q, params: SONGS }))

// ───────── YouTube normal ─────────
async function ytPage(q, token, params) {
  const ctx = { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'es', gl: 'AR' } }
  const body = token ? { context: ctx, continuation: token } : { context: ctx, query: q, ...(params ? { params } : {}) }
  const j = await fj('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', 9000, {
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

// ───────── Respaldos ─────────
async function searchInvidious(q) {
  let last
  for (const b of INVIDIOUS) {
    try {
      const arr = await fj(`${b}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, 4000)
      const out = (Array.isArray(arr) ? arr : []).filter(x => x.videoId && x.lengthSeconds > 20 && x.lengthSeconds <= MAX_SECONDS).slice(0, 20)
        .map(x => ({ id: x.videoId, title: x.title, by: x.author, img: 'https://i.ytimg.com/vi/' + x.videoId + '/hqdefault.jpg', dur: fmt(x.lengthSeconds) }))
      if (out.length) return out
    } catch (e) { last = e }
  }
  if (last) throw last
  return []
}
async function searchSoundcloud(q) {
  if (!C.ytdlpLines) throw new Error('sin yt-dlp para SoundCloud')
  const rows = await C.ytdlpLines(['scsearch15:' + q])
  return rows.map(e => {
    const url = e.webpage_url || e.url
    if (!url || !/soundcloud\.com/.test(url)) return null
    const th = e.thumbnail || (e.thumbnails && e.thumbnails[e.thumbnails.length - 1] && e.thumbnails[e.thumbnails.length - 1].url) || ''
    return { id: url, u: url, title: e.title || 'Sin título', by: e.uploader || e.channel || 'SoundCloud', img: th, dur: e.duration ? fmt(e.duration) : '' }
  }).filter(Boolean)
}
async function fallback(q) {
  const errors = []
  for (const [name, fn] of [['invidious', () => searchInvidious(q)], ['soundcloud', () => searchSoundcloud(q)]]) {
    try {
      const r = await fn()
      if (r && r.length) return r
      errors.push(name + ': sin resultados')
    } catch (e) { errors.push(name + ': ' + errMsg(e)) }
  }
  throw new Error('No encontré resultados. ' + errors.join(' | ').slice(0, 250))
}

module.exports = { searchYTMusic, ytPage, fallback }
