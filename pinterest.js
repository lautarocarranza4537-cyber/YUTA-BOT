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
const cleanTitle = s => decode(s).replace(/[\ue000\ue001]/g, '').replace(/\s+/g, ' ').trim()

function hostOk(u) {
  try {
    const x = new URL(u)
    if (!/^https?:$/.test(x.protocol)) return false
    const h = x.hostname.toLowerCase()
    return h === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(h)
  } catch { return false }
}

const keyOf = u => { const m = /i\.pinimg\.com\/[^/]+\/(.+)\.(?:jpg|jpeg|png|webp|gif)/i.exec(u); return m ? m[1] : u }

// Solo imágenes de pines de verdad (se descartan fotos de perfil, íconos y logos)
const PINIMG = /^https:\/\/i\.pinimg\.com\/(?:236x|474x|564x|736x|1200x|originals)\//i
const pinOk = u => PINIMG.test(u)

// ¿El título tiene que ver con lo que se pidió?
function relevant(title, q) {
  if (!title) return false
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

async function apiPage(q, bookmark, scope = 'pins') {
  const src = '/search/' + (scope === 'videos' ? 'videos' : 'pins') + '/?q=' + encodeURIComponent(q)
  const opts = { query: q, scope }
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
    if (!x || x.is_promoted) continue
    const im = x.images && (x.images['736x'] || x.images.orig || x.images['474x'])
    items.push({ id: x.id, u: im && im.url, t: x.grid_title || x.title || '', video: !!(x.videos || x.story_pin_data || x.is_video) })
  }
  return { items, bookmark: rr.bookmark }
}
async function viaApi(q) {
  const p1 = await apiPage(q)
  let items = p1.items
  if (items.length < 14 && p1.bookmark && p1.bookmark !== '-end-') {
    try { items = items.concat((await apiPage(q, p1.bookmark)).items) } catch {}
  }
  return items.filter(x => x.u && pinOk(x.u))
}

// Bing Imágenes: solo lo que está alojado en Pinterest (o de cualquier sitio si any = true)
async function bingPage(q, first, any) {
  const u = 'https://www.bing.com/images/async?q=' + encodeURIComponent(any ? q : q + ' site:pinterest.com') + '&first=' + first + '&count=35&adlt=moderate&mmasync=1&setlang=es'
  const r = await fetch(u, { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('Bing respondió ' + r.status)
  const html = (await r.text()).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/')
  const out = []
  for (const m of html.matchAll(/"murl":"(https?:[^"]+?)"([^{}]*?)"t":"([^"]*)"/g)) {
    const url = m[1]
    if (any ? /^https:\/\//i.test(url) : pinOk(url)) out.push({ u: url, t: cleanTitle(m[3]) })
  }
  return out
}
async function viaBing(q, any) {
  let all = []
  for (const first of [0, 35, 70]) {
    try { all = all.concat(await bingPage(q, first, any)) } catch (e) { if (!all.length) throw e; break }
    if (all.length >= 40) break
  }
  return all
}

// Busca hasta k enlaces de imágenes. Lo que coincide con el título va primero.
async function search(q, k) {
  const seen = new Set(), pri = [], rest = []
  const take = (items, label, rank) => {
    let n = 0
    for (const it of items) {
      const key = keyOf(it.u)
      if (seen.has(key)) continue
      seen.add(key); n++
      if (rank && !relevant(it.t, q)) rest.push(it.u); else pri.push(it.u)
    }
    console.log('📌 ' + label + ': ' + n + ' resultados')
  }
  try { take(await viaApi(q), 'api', false) } catch (e) { console.log('⚠ pinterest api → ' + errMsg(e)) }
  if (pri.length < k) { try { take(await viaBing(q, false), 'bing', true) } catch (e) { console.log('⚠ pinterest bing → ' + errMsg(e)) } }
  let web = false
  if (pri.length + rest.length < 3) {
    try { take(await viaBing(q, true), 'bing (web)', true); web = true } catch (e) { console.log('⚠ bing web → ' + errMsg(e)) }
  }
  const urls = [...pri, ...rest].slice(0, k)
  if (!urls.length) throw new Error('No encontré imágenes de eso. Prueba con otro nombre.')
  urls.web = web
  return urls
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
      if (b.length < 6000) throw new Error('imagen muy chica')
      if (b.length > 8 * 1048576) throw new Error('muy pesada')
      if (!/image/i.test(r.headers.get('content-type') || '') && !isImage(b)) throw new Error('no es una imagen')
      const d = dims(b)
      if (d && (Math.max(d.w, d.h) < 300 || Math.max(d.w, d.h) / Math.max(1, Math.min(d.w, d.h)) > 3.2)) throw new Error('imagen no válida (tamaño)')
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
  out.web = !!urls.web
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

// mode: 'image' (comando pin) o 'video' (comando pinvideo)
async function fromLink(url, mode = 'image') {
  const r = await fetch(url, { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9', Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!hostOk(r.url)) throw new Error('Ese link no es de Pinterest.')
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const html = unesc(await r.text())
  const meta = prop => {
    const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']+)["\']', 'i')) ||
      html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i'))
    return m ? decode(m[1]) : ''
  }
  const titleP = toSpanish(meta('og:title').replace(/\s*[-|·]\s*Pinterest\s*$/i, '').trim()).then(t => t.slice(0, 120))

  const vids = [...new Set(html.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\\\s<>]+?\.mp4/g) || [])]
  const looksVideo = vids.length > 0 || /"video_list"|V_HLSV3|\.m3u8|"is_video":\s*true/.test(html)

  if (mode === 'image' && looksVideo) throw new Error('Ese pin es un video. Para bajarlo usa pinvideo.')
  if (mode === 'video' && !looksVideo) throw new Error('Ese pin es una imagen. Para bajarla usa pin.')

  if (mode === 'video') {
    if (vids.length) {
      const pref = ['720p', '1080p', '480p', '360p']
      const u = pref.map(p => vids.find(v => v.includes(p))).find(Boolean) || vids[0]
      try { return { type: 'video', buf: await getVideo(u), title: await titleP } } catch (e) { console.log('⚠ pin mp4 →', errMsg(e)); if (/pesado/.test(errMsg(e))) throw e }
    }
    const v = await social.video('pin', r.url)
    return { type: 'video', buf: v.buf, title: await titleP }
  }

  const og = meta('og:image')
  if (!og) throw new Error('No encontré ninguna imagen en ese pin.')
  const orig = og.replace(/\/(?:\d+x|\d+x\d+_RS|originals)\//, '/originals/')
  try { return { type: 'image', buf: await getImg(orig), title: await titleP } } catch {}
  return { type: 'image', buf: await getImg(og), title: await titleP }
}

// Busca videos de Pinterest por nombre y baja el primero que se pueda
async function videoByName(q) {
  const p = await apiPage(q, null, 'videos')
  const ids = [...new Set(p.items.filter(x => x.id).map(x => String(x.id)))].slice(0, 5)
  if (!ids.length) throw new Error('No encontré videos de eso en Pinterest.')
  let last = null
  for (const id of ids) {
    try { return await fromLink('https://www.pinterest.com/pin/' + id + '/', 'video') } catch (e) { last = e; console.log('⚠ pinvideo ' + id + ' →', errMsg(e)) }
  }
  throw last || new Error('No pude bajar ningún video de eso.')
}

module.exports = { hostOk, images, fromLink, videoByName, _t: { variants, keyOf, relevant, pinOk, cleanTitle } }
