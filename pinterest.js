const social = require('./social')
const { errMsg } = require('./core')
const { toSpanish } = require('./translate')

const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CAP = 40 * 1024 * 1024

const unesc = s => s.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/')
const cp = n => { try { return String.fromCodePoint(n) } catch { return '' } }
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => cp(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const tokens = s => norm(s).split(/[^a-z0-9]+/).filter(t => t.length > 1)

function hostOk(u) {
  try {
    const x = new URL(u)
    if (!/^https?:$/.test(x.protocol)) return false
    const h = x.hostname.toLowerCase()
    return h === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(h)
  } catch { return false }
}

const keyOf = u => { const m = /i\.pinimg\.com\/[^/]+\/(.+)\.(?:jpg|jpeg|png|webp|gif)/i.exec(u); return m ? m[1] : u }

// ¿El título tiene que ver con lo que se pidió?
function relevant(title, q) {
  if (!title) return true
  const qt = tokens(q)
  if (!qt.length) return true
  const t = tokens(title).join(' ')
  let hit = 0
  for (const x of qt) if (t.includes(x)) hit++
  return hit >= Math.max(1, Math.ceil(qt.length * 0.5))
}

function variants(u) {
  const m = /^https:\/\/i\.pinimg\.com\/[^/]+\/(.+)\.(jpg|jpeg|png|webp)$/i.exec(u)
  if (!m) return [u]
  const p = m[1], e = m[2].toLowerCase()
  return [...new Set([
    'https://i.pinimg.com/736x/' + p + '.' + e,
    'https://i.pinimg.com/736x/' + p + '.jpg',
    'https://i.pinimg.com/564x/' + p + '.jpg',
    'https://i.pinimg.com/originals/' + p + '.' + e,
    'https://i.pinimg.com/474x/' + p + '.jpg',
    u
  ])]
}

async function apiPage(q, bookmark) {
const src = '/search/pins/?q=' + encodeURIComponent(q)
  const opts = { query: q, scope: 'pins' }
  if (bookmark) opts.bookmarks = [bookmark]
  const data = JSON.stringify({ options: opts, context: {} })
  const u = 'https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=' + encodeURIComponent(src) + '&data=' + encodeURIComponent(data) + '&_=' + Date.now()
  const r = await fetch(u, {
    headers: { 'User-Agent': DESK, Accept: 'application/json, text/javascript, */*, q=0.01', 'X-Requested-With': 'XMLHttpRequest', 'X-Pinterest-AppState': 'active', 'X-Pinterest-Source-Url': src, 'Accept-Language': 'es-419,es;q=0.9', Referer: 'https://www.pinterest.com/' },
    signal: AbortSignal.timeout(12000)
  })
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const j = await r.json()
  const rr = j.resource_response || {}
  const items = []
  for (const x of (rr.data && rr.data.results) || []) {
    if (!x || !x.images || x.is_promoted) continue
    const im = x.images['736x'] || x.images.orig || x.images['474x']
    if (im && im.url) items.push({ u: im.url, t: x.grid_title || x.title || '' })
  }
  return { items, bookmark: rr.bookmark }
}
async function viaApi(q) {
  const p1 = await apiPage(q)
  let items = p1.items
  if (items.length < 14 && p1.bookmark && p1.bookmark !== '-end-') {
    try { items = items.concat((await apiPage(q, p1.bookmark)).items) } catch {}
  }
  return items
}

// Respaldo: Bing Imágenes (con título), solo lo alojado en Pinterest
async function bingPage(q, first) {
  const u = 'https://www.bing.com/images/async?q=' + encodeURIComponent(q + ' site:pinterest.com') + '&first=' + first + '&count=35&adlt=moderate&mmasync=1&setlang=es'
  const r = await fetch(u, { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('Bing respondió ' + r.status)
  const html = (await r.text()).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/')
  const out = []
  for (const m of html.matchAll(/"murl":"(https?:[^"]+?)"([^{}]*?)"t":"([^"]*)"/g)) {
    if (/^https:\/\/i\.pinimg\.com\//i.test(m[1])) out.push({ u: m[1], t: decode(m[3]) })
  }
  return out
}
async function viaBing(q) {
  let all = []
  for (const first of [0, 35, 70]) {
    try { all = all.concat(await bingPage(q, first)) } catch (e) { if (!all.length) throw e; break }
    if (all.length >= 40) break
  }
  return all
}

async function viaHtml(q) {
  const r = await fetch('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q) + '&rs=typed', { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const html = unesc(await r.text())
  return (html.match(/https:\/\/i\.pinimg\.com\/(?:236x|474x|564x|736x|originals)\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+\.(?:jpg|png|webp)/gi) || []).map(u => ({ u, t: '' }))
}

async function search(q, k) {
  const seen = new Set(), out = []
  const take = (items, label, filter) => {
    let n = 0, dropped = 0
    for (const it of items) {
      const key = keyOf(it.u)
      if (seen.has(key)) continue
      if (filter && !relevant(it.t, q)) { dropped++; continue }
      seen.add(key); out.push(it.u); n++
    }
    console.log('📌 ' + label + ': ' + n + ' útiles' + (dropped ? ', ' + dropped + ' descartados por no coincidir' : ''))
  }
  try { take(await viaApi(q), 'api', false) } catch (e) { console.log('⚠ pinterest api → ' + errMsg(e)) }
  if (out.length < k) { try { take(await viaBing(q), 'bing', true) } catch (e) { console.log('⚠ pinterest bing → ' + errMsg(e)) } }
  if (out.length < k) { try { take(await viaHtml(q), 'html', false) } catch (e) { console.log('⚠ pinterest html → ' + errMsg(e)) } }
  if (!out.length) throw new Error('No encontré imágenes de eso en Pinterest. Prueba con otro nombre.')
  return out.slice(0, k)
}

const isImage = b => b.length > 3 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') || b.slice(0, 4).toString() === 'GIF8')

function dims(b) {
  try {
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i++; continue }
        const mk = b[i + 1]
        if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
        i += 2 + b.readUInt16BE(i + 2)
      }
    }
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  } catch {}
  return null
}

async function getImg(u) {
  let last = new Error('sin respuesta')
  for (const v of variants(u)) {
    try {
      const r = await fetch(v, { headers: { 'User-Agent': DESK, Referer: 'https://www.pinterest.com/', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(15000) })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const b = Buffer.from(await r.arrayBuffer())
      if (b.length < 2000) throw new Error('imagen muy chica')
      if (b.length > 8 * 1048576) throw new Error('muy pesada')
      if (!/image/i.test(r.headers.get('content-type') || '') && !isImage(b)) throw new Error('no es una imagen')
      const d = dims(b)
      if (d && Math.max(d.w, d.h) < 250) throw new Error('imagen diminuta')
      return b
    } catch (e) { last = e }
  }
  throw last
}

async function images(q, n = 10) {
  const urls = await search(q, n + 8)
  const out = []
  let fails = 0, firstErr = ''
  for (let i = 0; i < urls.length && out.length < n; i += 5) {
    const res = await Promise.allSettled(urls.slice(i, i + 5).map(getImg))
    for (const r of res) {
      if (r.status === 'fulfilled') { if (out.length < n) out.push(r.value) }
      else { fails++; if (!firstErr) firstErr = errMsg(r.reason) }
    }
  }
  console.log('📌 pin "' + q + '": ' + urls.length + ' links, ' + out.length + ' descargadas, ' + fails + ' fallaron' + (firstErr ? ' (' + firstErr + ')' : ''))
  return out
}

async function getVideo(u) {
  const r = await fetch(u, { headers: { 'User-Agent': DESK }, signal: AbortSignal.timeout(90000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  if ((+r.headers.get('content-length') || 0) > CAP) throw new Error('El video es muy pesado (máx 40 MB).')
  const chunks = []
  let n = 0
  for await (const c of r.body) { n += c.length; if (n > CAP) throw new Error('El video es muy pesado (máx 40 MB).'); chunks.push(c) }
  return Buffer.concat(chunks)
}

async function fromLink(url) {
  const r = await fetch(url, { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9', Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!hostOk(r.url)) throw new Error('Ese link no es de Pinterest.')
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const html = unesc(await r.text())
  const meta = prop => {
    const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']+)["\']', 'i')) ||
      html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i'))
    return m ? decode(m[1]) : ''
  }
  const rawTitle = meta('og:title').replace(/\s*[-|·]\s*Pinterest\s*$/i, '').trim()
  const titleP = toSpanish(rawTitle).then(t => t.slice(0, 120))

  const vids = [...new Set(html.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\\\s<>]+?\.mp4/g) || [])]
  if (vids.length) {
    const pref = ['720p', '1080p', '480p', '360p']
    const u = pref.map(p => vids.find(v => v.includes(p))).find(Boolean) || vids[0]
    try { return { type: 'video', buf: await getVideo(u), title: await titleP } } catch (e) { console.log('⚠ pin mp4 →', errMsg(e)); if (/pesado/.test(errMsg(e))) throw e }
  }
  if (/"video_list"|V_HLSV3|\.m3u8|"is_video":\s*true/.test(html)) {
    try { const v = await social.video('pin', url); return { type: 'video', buf: v.buf, title: await titleP } } catch (e) { console.log('⚠ pin yt-dlp →', errMsg(e)) }
  }
  const og = meta('og:image')
  if (!og) throw new Error('No encontré ninguna imagen ni video en ese pin.')
  const orig = og.replace(/\/(?:\d+x|\d+x\d+_RS|originals)\//, '/originals/')
  try { return { type: 'image', buf: await getImg(orig), title: await titleP } } catch {}
  return { type: 'image', buf: await getImg(og), title: await titleP }
}

module.exports = { hostOk, images, fromLink, _t: { variants, keyOf, relevant } }
