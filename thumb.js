const { convert } = require('./wacore')
const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const isYt = u => /ytimg\.com|youtube\.com/.test(u || '')

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const b = Buffer.from(await r.arrayBuffer())
  if (b.length < 4000) throw new Error('imagen muy chica')
  return b
}
const ok = x => x && x.status === 'fulfilled'

// Portada de la tarjeta: se piden las opciones a la vez y se usa la mejor.
// La miniatura máxima de YouTube ya viene en 16:9 sin barras negras, así que se manda tal cual (sin gastar CPU).
async function best(item, id) {
  const hint = item && item.img
  const album = hint && !isYt(hint) ? (/googleusercontent\.com/.test(hint) ? hint.replace(/=w\d+-h\d+(-[a-z0-9-]*)?$/i, '=w600-h600-l90-rj') : hint) : null
  const [a, mx, sd] = await Promise.allSettled([
    album ? get(album) : Promise.reject(new Error('sin carátula')),
    id ? get('https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg') : Promise.reject(new Error('sin id')),
    id ? get('https://i.ytimg.com/vi/' + id + '/sddefault.jpg') : Promise.reject(new Error('sin id'))
  ])
  if (ok(a)) { try { return await convert(a.value, 'jpg', 'jpg', ['-vf', 'scale=min(480\\,iw):-2', '-frames:v', '1', '-q:v', '2']) } catch { return a.value } }
  if (ok(mx)) return mx.value
  if (ok(sd)) { try { return await convert(sd.value, 'jpg', 'jpg', ['-vf', 'crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16),scale=min(640\\,iw):-2', '-frames:v', '1', '-q:v', '2']) } catch { return sd.value } }
  if (hint) { try { return await get(hint) } catch {} }
  if (id) { try { return await get('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg') } catch {} }
  return null
}
module.exports = { best }
