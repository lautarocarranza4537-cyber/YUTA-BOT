const api = require('./api')
const H = api.h
const cache = new Map()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const durSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)

async function top(q) {
  const k = q.toLowerCase()
  const hit = cache.get(k)
  if (hit && Date.now() - hit.t < 600000) return hit.v
  const safe = p => p.then(v => v || [], () => [])
  const mP = safe(H.searchYTMusic(q))
  const yP = safe(H.ytPage(q).then(r => r.items))
  const first = await Promise.race([mP.then(v => ({ s: 'm', v })), yP.then(v => ({ s: 'y', v }))])
  let list
  if (first.s === 'm' && first.v.length) list = first.v
  else if (first.s === 'm') list = await yP
  else {
    const m = await Promise.race([mP, sleep(first.v.length ? 2000 : 12000).then(() => [])])
    list = m.length ? m : first.v
  }
  if (!list.length) { try { list = await H.fallback(q) } catch {} }
  const item = list.find(x => durSec(x.dur) <= 12 * 60) || list[0] || null
  if (item) {
    cache.set(k, { t: Date.now(), v: item })
    if (cache.size > 200) cache.delete(cache.keys().next().value)
  }
  return item
}
module.exports = { top }
