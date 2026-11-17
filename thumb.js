const { convert } = require('./wacore')
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const isYt = u => /ytimg\.com|youtube\.com/.test(u || '')

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const b = Buffer.from(await r.arrayBuffer())
  if (b.length < 4000) throw new Error('imagen muy chica')
  return b
}

// Mejor miniatura posible, recortada a 16:9 (sin barras negras) y en calidad alta
async function best(item, id) {
  const hint = item && item.img
  const urls = []
  if (hint && !isYt(hint)) urls.push(/googleusercontent\.com/.test(hint) ? hint.replace(/=w\d+-h\d+(-[a-z0-9-]*)?$/i, '=w600-h600-l90-rj') : hint)
  if (id) for (const n of ['maxresdefault', 'sddefault', 'hqdefault']) urls.push('https://i.ytimg.com/vi/' + id + '/' + n + '.jpg')
  if (hint) urls.push(hint)
  for (const u of urls) {
    try {
      const buf = await get(u)
      const vf = isYt(u) ? 'crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16),scale=min(640\\,iw):-2' : 'scale=min(480\\,iw):-2'
      try { return await convert(buf, 'jpg', 'jpg', ['-vf', vf, '-frames:v', '1', '-q:v', '2']) } catch { return buf }
    } catch {}
  }
  return null
}
module.exports = { best }
