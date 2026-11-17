const api = require('./api')
const H = api.h
const cache = new Map()
const sleep = ms => new Promise(r => setTimeout(r, ms))
const durSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)
const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?v=)([\w-]{11})/i
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const toks = s => norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 1)
const BAD = /\b(reaction|reaccion|karaoke|tutorial|slowed|reverb|sped ?up|nightcore|8d|instrumental)\b/

// Qué tan bien coincide el resultado con lo pedido
function score(q, it, rank, mode) {
  const qt = toks(q)
  if (!qt.length) return 0
  const hay = ' ' + toks(it.title + ' ' + it.by).join(' ') + ' '
  let hit = 0
  for (const t of qt) if (hay.includes(' ' + t)) hit++
  let s = hit / qt.length
  const m = BAD.exec(norm(it.title))
  if (m && !norm(q).includes(m[1])) s -= 0.25
  if (it.music && mode === 'audio') s += 0.12
  return s - rank * 0.002
}

// Busca en YouTube Music y en YouTube normal a la vez
async function both(q) {
  const safe = p => p.then(v => v || [], () => [])
  const mP = safe(H.searchYTMusic(q)).then(v => ({ s: 'm', v }))
  const yP = safe(H.ytPage(q).then(r => r.items)).then(v => ({ s: 'y', v }))
  const first = await Promise.race([mP, yP])
  const otherP = first.s === 'm' ? yP : mP
  const other = await Promise.race([otherP, sleep(first.v.length ? 2500 : 12000).then(() => ({ s: first.s === 'm' ? 'y' : 'm', v: [] }))])
  return { m: first.s === 'm' ? first.v : other.v, y: first.s === 'y' ? first.v : other.v }
}

async function find(q, mode = 'audio') {
  const lm = q.match(YT)
  if (lm) return { id: lm[1], title: '', by: '', img: '', dur: '' }
  const key = mode + ':' + q.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < 600000) return hit.v

  const { m, y } = await both(q)
  const seen = new Set(), list = []
  const put = (arr, music) => arr.forEach(x => { if (x && x.id && !seen.has(x.id)) { seen.add(x.id); list.push({ ...x, music }) } })
  if (mode === 'video') { put(y, false); put(m, true) } else { put(m, true); put(y, false) }
  let cands = list
  if (!cands.length) { try { cands = await H.fallback(q) } catch {} }
  const maxS = mode === 'video' ? 15 * 60 : 12 * 60
  const ok = cands.filter(x => { const s = durSec(x.dur); return !s || (s >= 20 && s <= maxS) })
  let pool = ok.length ? ok : cands
  if (mode === 'video') pool = pool.filter(x => /^[\w-]{11}$/.test(String(x.id)) && !x.u)
  let best = null, bs = -9
  pool.forEach((x, i) => { const s = score(q, x, i, mode); if (s > bs) { bs = s; best = x } })
  if (best) {
    cache.set(key, { t: Date.now(), v: best })
    if (cache.size > 200) cache.delete(cache.keys().next().value)
  }
  return best
}

module.exports = { find, top: q => find(q, 'audio') }
