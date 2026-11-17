const social = require('./social')
const { errMsg } = require('./core')
const DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CAP = 40 * 1024 * 1024

function hostOk(u) {
  try {
    const x = new URL(u)
    if (!/^https?:$/.test(x.protocol)) return false
    const h = x.hostname.toLowerCase()
    return h === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(h)
  } catch { return false }
}
const unesc = s => s.replace(/\\u002F/g, '/').replace(/\\\//g, '/')

async function viaApi(q) {
  const src = '/search/pins/?q=' + encodeURIComponent(q)
  const data = JSON.stringify({ options: { query: q, scope: 'pins' }, context: {} })
  const u = 'https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=' + encodeURIComponent(src) + '&data=' + encodeURIComponent(data) + '&_=' + Date.now()
  const r = await fetch(u, {
    headers: { 'User-Agent': DESK, Accept: 'application/json, text/javascript, */*, q=0.01', 'X-Requested-With': 'XMLHttpRequest', 'X-Pinterest-AppState': 'active', 'X-Pinterest-Source-Url': src, 'Accept-Language': 'es-419,es;q=0.9', Referer: 'https://www.pinterest.com/' },
    signal: AbortSignal.timeout(12000)
  })
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const j = await r.json()
  const res = (j.resource_response && j.resource_response.data && j.resource_response.data.results) || []
  const out = []
  for (const x of res) {
    if (!x || !x.images || x.is_promoted) continue
    const im = x.images['736x'] || x.images.orig || x.images['474x']
    if (im && im.url && !out.includes(im.url)) out.push(im.url)
  }
  return out
}

async function viaHtml(q) {
  const r = await fetch('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(q) + '&rs=typed', { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const html = unesc(await r.text())
  const re = /https:\/\/i\.pinimg\.com\/(?:236x|474x|564x|736x|originals)\/([0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]+)\.(?:jpg|png|webp)/gi
  const seen = new Set(), out = []
  for (const m of html.matchAll(re)) if (!seen.has(m[1])) { seen.add(m[1]); out.push('https://i.pinimg.com/736x/' + m[1] + '.jpg') }
  return out
}

async function search(q, k) {
  let urls = []
  try { urls = await viaApi(q) } catch (e) { console.log('⚠ pinterest api →', errMsg(e)) }
  if (urls.length < 3) {
    try { urls = [...new Set([...urls, ...(await viaHtml(q))])] } catch (e) { console.log('⚠ pinterest html →', errMsg(e)) }
  }
  if (!urls.length) throw new Error('No encontré imágenes de eso en Pinterest (puede estar bloqueando al servidor).')
  return urls.slice(0, k)
}

async function getImg(u) {
  const r = await fetch(u, { headers: { 'User-Agent': DESK, Referer: 'https://www.pinterest.com/' }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  if (!/image/i.test(r.headers.get('content-type') || '')) throw new Error('no es imagen')
  const b = Buffer.from(await r.arrayBuffer())
  if (b.length > 8 * 1048576) throw new Error('muy pesada')
  return b
}

// Hasta n imágenes (buffers) de lo que se pidió
async function images(q, n = 10) {
  const urls = await search(q, n + 6)
  const out = []
  for (let i = 0; i < urls.length && out.length < n; i += 5) {
    const res = await Promise.allSettled(urls.slice(i, i + 5).map(getImg))
    for (const r of res) if (r.status === 'fulfilled' && out.length < n) out.push(r.value)
  }
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

// Pin por link: devuelve { type: 'video'|'image', buf, title }
async function fromLink(url) {
  const r = await fetch(url, { headers: { 'User-Agent': DESK, 'Accept-Language': 'es-419,es;q=0.9', Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
  if (!hostOk(r.url)) throw new Error('Ese link no es de Pinterest.')
  if (!r.ok) throw new Error('Pinterest respondió ' + r.status)
  const html = unesc(await r.text())
  const meta = prop => {
    const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']+)["\']', 'i')) ||
      html.match(new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop + '["\']', 'i'))
    return m ? m[1].replace(/&amp;/g, '&') : ''
  }
  const title = meta('og:title').slice(0, 120)

  const vids = [...new Set(html.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\\\s<>]+?\.mp4/g) || [])]
  if (vids.length) {
    const pref = ['720p', '1080p', '480p', '360p']
    const u = pref.map(p => vids.find(v => v.includes(p))).find(Boolean) || vids[0]
    try { return { type: 'video', buf: await getVideo(u), title } } catch (e) { console.log('⚠ pin mp4 →', errMsg(e)); if (/pesado/.test(errMsg(e))) throw e }
  }
  const looksVideo = /"video_list"|V_HLSV3|\.m3u8|"is_video":\s*true/.test(html)
  if (looksVideo) {
    try { const v = await social.video('pin', url); return { type: 'video', buf: v.buf, title: title || v.title } } catch (e) { console.log('⚠ pin yt-dlp →', errMsg(e)) }
  }
  const og = meta('og:image')
  if (!og) throw new Error('No encontré ninguna imagen ni video en ese pin.')
  const orig = og.replace(/\/(?:\d+x|\d+x\d+_RS|originals)\//, '/originals/')
  try { return { type: 'image', buf: await getImg(orig), title } } catch {}
  return { type: 'image', buf: await getImg(og), title }
}

module.exports = { hostOk, images, fromLink }
