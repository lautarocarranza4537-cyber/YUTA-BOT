const yt = require('./yt')
const fast = require('./fast')
const thumb = require('./thumb')
const fmt = require('./fmt')
const pin = require('./pinterest')
const social = require('./social')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const MAX_MIN = 15
const CAP = 50 * 1048576

module.exports = H => {
  const { add, enqueue, pending, durSec } = H

  // ───── play2: video de YouTube en 720p ─────
  add(['play2', 'playvid'], 'Descargas', 'Descarga un video de YouTube en 720p (máx 50 MB)', { usage: '<nombre o link>', heavy: true }, async c => {
    const q = c.text
    if (!q) return c.reply('Uso: `' + c.prefix + 'play2` _nombre del video o link de YouTube_\nEj: `' + c.prefix + 'play2 montagem apollo`')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
    await c.sock.sendMessage(c.chat, { react: { text: '🔎', key: c.m.key } }).catch(() => {})
    try {
      await enqueue(async () => {
        const t0 = Date.now()
        const item = await fast.find(q, 'video')
        if (!item || !/^[\w-]{11}$/.test(String(item.id))) return c.reply('❌ No encontré ese video en YouTube.')
        if (durSec(item.dur) > MAX_MIN * 60) return c.reply('❌ Ese video es muy largo (máx ' + MAX_MIN + ' min).')
        const det = yt.details(item.id).catch(() => null)
        const card = (async () => {
          const d = await det
          const cap = fmt.card({
            icon: '🎬', title: (d && d.title) || item.title, by: (d && d.by) || item.by,
            dur: (d && d.seconds) || item.dur, views: d && d.views, link: 'https://youtu.be/' + item.id, date: d && d.date,
            note: '⏳ _Descargando el video en 720p..._'
          })
          const img = await thumb.best(item, item.id).catch(() => null)
          try { await c.sock.sendMessage(c.chat, img ? { image: img, caption: cap } : { text: cap }, { quoted: c.m }) } catch { await c.reply(cap) }
          return d
        })()
        const v = await yt.video(item.id, 720, CAP)
        const d = await card
        const title = ((d && d.title) || item.title || 'Video').slice(0, 120)
        const label = (v.height || 720) + 'p'
        const note = v.height && v.height < 720 ? '\n_No había 720p o pesaba mucho, te mando la mejor calidad posible._' : ''
        await c.sock.sendMessage(c.chat, { video: v.buf, mimetype: 'video/mp4', caption: '🎬 ' + title + ' · ' + label + note }, { quoted: c.m })
        await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
        console.log('⏱ play2 (' + v.via + ') ' + label + ' ' + (Date.now() - t0) + ' ms | ' + (v.buf.length / 1048576).toFixed(1) + ' MB')
      })
    } catch (e) {
      console.log('PLAY2 ERROR:', e.message)
      await c.reply('❌ ' + String(e.message || 'No pude descargar el video').slice(0, 200)).catch(() => {})
    }
  })

  // ───── pin: 10 imágenes de Pinterest, o descarga de un pin por link ─────
  add(['pin', 'pinterest'], 'Descargas', 'Busca 10 imágenes o descarga un pin por link', { usage: '<nombre o link>', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'pin` _goku_ (te mando 10 imágenes)\nO con un link: `' + c.prefix + 'pin` _https://pin.it/xxxx_')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
    await c.sock.sendMessage(c.chat, { react: { text: '📌', key: c.m.key } }).catch(() => {})
    try {
      await enqueue(async () => {
        const url = social.findUrl(q)
        if (url) {
          if (!pin.hostOk(url)) return c.reply('Ese link no es de Pinterest.')
          const r = await pin.fromLink(url)
          const cap = '📌 ' + (r.title || 'Pinterest')
          if (r.type === 'video') await c.sock.sendMessage(c.chat, { video: r.buf, mimetype: 'video/mp4', caption: cap }, { quoted: c.m })
          else await c.sock.sendMessage(c.chat, { image: r.buf, caption: cap }, { quoted: c.m })
        } else {
          const imgs = await pin.images(q, 10)
          if (!imgs.length) return c.reply('❌ No pude descargar imágenes de eso. Prueba con otra búsqueda.')
          for (let i = 0; i < imgs.length; i++) {
            const msg = { image: imgs[i] }
            if (i === 0) msg.caption = '📌 *Pinterest* · ' + q.slice(0, 60) + '\n_' + imgs.length + (imgs.length === 1 ? ' imagen' : ' imágenes') + '_'
            await c.sock.sendMessage(c.chat, msg, i === 0 ? { quoted: c.m } : undefined)
            await sleep(400)
          }
        }
        await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
      })
    } catch (e) {
      console.log('PIN ERROR:', e.message)
      await c.reply('❌ ' + String(e.message || 'No pude descargar eso de Pinterest').slice(0, 200)).catch(() => {})
    }
  })
}
