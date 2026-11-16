const C = require('./core')
const api = require('./api')
const { errMsg, fetchJson } = C
const H = api.h

const MAX_SECONDS = 20 * 60
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}
const toSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)
const fmt = s => { s = Math.round(Number(s) || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

const cache = new Map()
async function cached(key, ms, fn) {
  const h = cache.get(key)
  if (h && Date.now() - h.t < ms) return h.v
  const v = await fn()
  if (v.results && v.results.length) {
    cache.set(key, { t: Date.now(), v })
    if (cache.size > 100) cache.delete(cache.keys().next().value)
  }
  return v
}

async function ytPage(q, token) {
  const ctx = { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'es', gl: 'AR' } }
  const body = token ? { context: ctx, continuation: token } : { context: ctx, query: q }
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

async function find(q, token) {
  if (token) {
    const p = await ytPage(q, token)
    return { results: p.items, next: p.next }
  }
  const [a, b] = await Promise.allSettled([H.searchYTMusic(q), ytPage(q)])
  const seen = new Set(), results = []
  const add = x => { if (!seen.has(x.id)) { seen.add(x.id); results.push(x) } }
  if (a.status === 'fulfilled') a.value.forEach(add)
  else console.log('⚠ YouTube Music →', errMsg(a.reason))
  if (b.status === 'fulfilled') b.value.items.forEach(add)
  else console.log('⚠ YouTube →', errMsg(b.reason))
  const next = b.status === 'fulfilled' ? b.value.next : null
  if (!results.length) {
    const r = await H.search(q)
    return { results: r.results, next: null }
  }
  return { results, next }
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  try {
    if (u.pathname === '/api/find') {
      const q = (u.searchParams.get('q') || '').trim().slice(0, 120)
      const t = (u.searchParams.get('t') || '').slice(0, 2000)
      if (!q) { send(res, 400, { error: 'Falta ?q=' }); return true }
      await C.ready
      const key = 'f:' + q.toLowerCase() + ':' + t.slice(-30)
      send(res, 200, await cached(key, 120000, () => find(q, t)))
      return true
    }
    if (u.pathname === '/api/suggest') {
      const q = (u.searchParams.get('q') || '').trim().slice(0, 80)
      let list = []
      if (q) {
        try {
          const arr = await fetchJson('https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=es&q=' + encodeURIComponent(q), 4000)
          list = (arr[1] || []).slice(0, 8)
        } catch (e) {}
      }
      send(res, 200, { suggestions: list })
      return true
    }
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: errMsg(e) })
    return true
  }
  return false
}
