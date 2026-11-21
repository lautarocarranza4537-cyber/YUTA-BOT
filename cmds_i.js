const yt = require('./yt')
const fast = require('./fast')
const play = require('./audio')
const thumb = require('./thumb')
const fmt = require('./fmt')
const pin = require('./pinterest')
const social = require('./social')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const MAX_MIN = 12
// .play siempre entrega M4A; las conversiones usan /tmp (efímero) y se limpian al terminar.
const audioExt = (ct, buf) => {
  if (buf && buf.slice(0, 4).toString() === 'OggS') return 'ogg'
  if (buf && buf.length >= 8 && buf.slice(4, 8).toString() === 'ftyp') return 'm4a'
  if (buf && (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) return 'mp3'
  if (buf && buf.slice(0, 4).toString() === '\u001aE\u00df\u00a3') return 'webm'
  return /mpeg|mp3/i.test(ct || '') ? 'mp3' : /ogg/i.test(ct || '') ? 'ogg' : /webm|opus/i.test(ct || '') ? 'webm' : 'm4a'
}

module.exports = H => {
  const { add, enqueue, pending, durSec, convert } = H
  const toVoice = (buf, ext) => convert(buf, ext, 'ogg', ['-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-application', 'voip', '-f', 'ogg'], 120000)
  const toM4a = (buf, ext) => convert(buf, ext, 'm4a', ['-vn', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'], 120000)

  // Un solo flujo para play (audio normal) y playaudio (nota de voz)
  async function song(c, voice) {
    const q = c.text
    const name = voice ? 'playaudio' : 'play'
    if (!q) return c.reply('Uso: `' + c.prefix + name + '` _nombre de la canción o link de YouTube_\nEj: `' + c.prefix + name + ' montagem apollo`')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
    await c.sock.sendMessage(c.chat, { react: { text: '🔎', key: c.m.key } }).catch(() => {})
    try {
      await enqueue(async () => {
        const t0 = Date.now()
        const item = await fast.find(q, 'audio')
        if (!item) return c.reply('❌ No encontré esa canción. Prueba con otro nombre.')
        if (durSec(item.dur) > MAX_MIN * 60) return c.reply('❌ Esa canción es muy larga (máx ' + MAX_MIN + ' min).')
        const t1 = Date.now()
        const ytId = item.u ? null : item.id
        const link = item.u || 'https://youtu.be/' + item.id

        // La tarjeta y el audio se preparan a la vez
        const cardP = (async () => {
          const d = ytId ? await yt.details(ytId).catch(() => null) : null
          const cap = fmt.card({
            icon: voice ? '🎙️' : '🎧', title: (d && d.title) || item.title, by: (d && d.by) || item.by,
            dur: (d && d.seconds) || item.dur, views: d && d.views, link, date: d && d.date,
            note: '⏳ _Descargando el audio..._'
          })
          const img = await thumb.best(item, ytId).catch(() => null)
          try { await c.sock.sendMessage(c.chat, img ? { image: img, caption: cap } : { text: cap }, { quoted: c.m }) } catch { await c.reply(cap) }
          return d
        })()
        const audioP = play.audio(item.u ? '' : item.id, item.u || '', item.title)

        const a = await audioP
        const t2 = Date.now()
        let out = a.buf, msg
        const ext = audioExt(a.ct, a.buf)
        const d = await cardP.catch(() => null)
        const title = (((d && d.title) || item.title || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80)) || 'audio'
        if (voice) {
          try { out = await toVoice(a.buf, ext) } catch (e) { throw new Error('No pude convertir el audio a nota de voz (' + e.message + ')') }
          msg = { audio: out, mimetype: 'audio/ogg; codecs=opus', ptt: true }
        } else {
          if (!/mp4/i.test(a.ct || '')) out = await toM4a(a.buf, ext)
          msg = { audio: out, mimetype: 'audio/mp4', fileName: title + '.m4a' }
        }
        const t3 = Date.now()
        await c.sock.sendMessage(c.chat, msg, { quoted: c.m })
        await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
        console.log('⏱ ' + name + ' búsqueda ' + (t1 - t0) + ' ms | audio ' + (t2 - t1) + ' ms | conversión ' + (t3 - t2) + ' ms | envío ' + (Date.now() - t3) + ' ms | total ' + (Date.now() - t0) + ' ms')
      })
    } catch (e) {
      console.log(name.toUpperCase() + ' ERROR:', e.message)
      const challenge = e && (e.code === 'YOUTUBE_BOT_CHALLENGE' || /sign[ -]?in to confirm|confirm you(?:'|’)re not a bot|not a bot|unusual traffic|captcha/i.test(String(e.message || '')))
      const message = challenge
        ? 'YouTube está pidiendo iniciar sesión para verificar el tráfico. No pude obtener el audio; la conversión a M4A o nota de voz no empezó.'
        : String(e.message || 'No pude descargar el audio').slice(0, 200)
      await c.reply('❌ ' + message).catch(() => {})
    }
  }

  add(['play', 'musica', 'p'], 'Música', 'Envía audio M4A (máx 12 min / 30 MB)', { usage: '<nombre o link>', heavy: true }, c => song(c, false))
  add(['playaudio', 'ytaudio', 'playnota', 'playvoz'], 'Música', 'Convierte y manda nota de voz Ogg/Opus (máx 12 min / 30 MB)', { usage: '<nombre o link>', heavy: true }, c => song(c, true))

  // ───── pin: solo imágenes (10 por búsqueda, o la imagen de un link) ─────
  add(['pin', 'pinterest'], 'Descargas', 'Busca 10 imágenes de Pinterest o descarga la imagen de un link', { usage: '<nombre o link>', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'pin` _goku_ (te mando 10 imágenes)\nO con un link: `' + c.prefix + 'pin` _https://pin.it/xxxx_\nPara videos usa `' + c.prefix + 'pinvideo`.')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
    await c.sock.sendMessage(c.chat, { react: { text: '📌', key: c.m.key } }).catch(() => {})
    try {
      await enqueue(async () => {
        const url = social.findUrl(q)
        if (url) {
          if (!pin.hostOk(url)) return c.reply('Ese link no es de Pinterest.')
          const r = await pin.fromLink(url, 'image')
          await c.sock.sendMessage(c.chat, { image: r.buf, caption: '📌 ' + (r.title || 'Pinterest') }, { quoted: c.m })
        } else {
          const imgs = await pin.images(q, 10)
          if (!imgs.length) return c.reply('❌ No pude descargar imágenes de eso. Prueba con otra búsqueda.')
          for (let i = 0; i < imgs.length; i++) {
            const msg = { image: imgs[i] }
            if (i === 0) msg.caption = '📌 *' + (imgs.web ? 'Imágenes' : 'Pinterest') + '* · ' + q.slice(0, 60) + '\n_' + imgs.length + (imgs.length === 1 ? ' imagen' : ' imágenes') + '_' + (imgs.web ? '\n_Pinterest no respondió, estas vienen de la web._' : '')
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

  // ───── pinvideo: solo videos de Pinterest ─────
  add(['pinvideo', 'pinvid', 'pinterestvideo'], 'Descargas', 'Descarga un video de Pinterest (por link o por nombre)', { usage: '<link o nombre>', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'pinvideo` _https://pin.it/xxxx_ o `' + c.prefix + 'pinvideo` _gatos graciosos_\nPara imágenes usa `' + c.prefix + 'pin`.')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
    await c.sock.sendMessage(c.chat, { react: { text: '📌', key: c.m.key } }).catch(() => {})
    try {
      await enqueue(async () => {
        const url = social.findUrl(q)
        let r
        if (url) {
          if (!pin.hostOk(url)) return c.reply('Ese link no es de Pinterest.')
          r = await pin.fromLink(url, 'video')
        } else r = await pin.videoByName(q)
        await c.sock.sendMessage(c.chat, { video: r.buf, mimetype: 'video/mp4', caption: '📌 ' + (r.title || 'Pinterest') }, { quoted: c.m })
        await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
      })
    } catch (e) {
      console.log('PINVIDEO ERROR:', e.message)
      await c.reply('❌ ' + String(e.message || 'No pude descargar ese video').slice(0, 200)).catch(() => {})
    }
  })
}
