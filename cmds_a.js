const fs = require('fs')
const play = require('./play')
const fast = require('./fast')
const social = require('./social')

const FORMAT = (process.env.AUDIO_FORMAT || 'mp3').toLowerCase()
const MAX_MIN = 12
const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?v=)([\w-]{11})/i

module.exports = H => {
  const { add, commands, ORDER, num, durSec, uptime, norm, botName, bannerFile, enqueue, pending, convert, toMp3, nekos, SITE } = H

  // ───── general ─────
  add(['menu', 'help', 'ayuda', 'comandos'], 'General', 'Muestra el menú', { usage: '[sección]' }, async c => {
    const cats = {}
    for (const x of new Set(Object.values(commands))) (cats[x.cat] ??= []).push(x)
    const keys = ORDER.filter(k => cats[k])
    const p = c.prefix
    const name = botName(c.phone)
    const f = norm(c.args[0])
    if (f) {
      const k = keys.find(x => norm(x) === f)
      if (!k) return c.reply('No existe esa sección.\nSecciones: ' + keys.map(norm).join(', '))
      let t = '*' + name + '* · ' + k + '\n\n'
      for (const x of cats[k]) if (!x.react) t += '`' + p + x.names[0] + '`' + (x.usage ? ' _' + x.usage + '_' : '') + '\n' + x.desc + '\n\n'
      const rs = cats[k].filter(x => x.react)
      if (rs.length) t += '*Reacciones*\n' + rs.map(x => '`' + p + x.names[0] + '`').join(' ') + '\nMenciona a alguien. Ej: _' + p + 'hug @usuario_'
      return c.reply(t.trim())
    }
    let t = '*' + name + '*\nHola @' + num(c.sender) + '\n'
    for (const k of keys) {
      const shown = cats[k].filter(x => !x.react).map(x => '`' + p + x.names[0] + '`')
      const rs = cats[k].filter(x => x.react)
      if (rs.length) shown.push(...rs.slice(0, 3).map(x => '`' + p + x.names[0] + '`'), '…')
      t += '\n*' + k + '*\n' + shown.join(' ')
    }
    t += '\n\n_Detalle de una sección:_ `' + p + 'menu musica`'
    let image = null
    const bf = bannerFile(c.phone)
    if (fs.existsSync(bf)) { try { image = fs.readFileSync(bf) } catch {} }
    if (!image) { try { image = { url: await nekos('waifu') } } catch {} }
    if (image) await c.sock.sendMessage(c.chat, { image, caption: t, mentions: [c.sender] }, { quoted: c.m })
    else await c.reply(t, [c.sender])
  })

  // OWNER CON TARJETA DE CONTACTO EMPRESARIAL L9KAS
  add(['owner', 'creador', 'dueno'], 'General', 'Contacto del creador', async c => {
    const vcard = 'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      'FN:L9kas | owner\n' +
      'ORG:L9kas Enterprise;\n' +
      'TEL;type=CELL;type=VOICE;waid=5493513157041:+54 9 351 315 7041\n' +
      'END:VCARD'

    await c.sock.sendMessage(c.chat, {
      contacts: {
        displayName: 'L9kas | owner',
        contacts: [{ vcard }]
      }
    }, { quoted: c.m })

    await c.reply(',_ L9kas | owner _\n\n_Ver contacto arriba._\n_Ver empresa: L9kas Enterprise_')
  })

  add(['ping', 'speed'], 'General', 'Comprueba que el bot responde', async c => {
    const t = Date.now()
    await c.reply('🏓 Pong!')
    await c.reply('⚡ ' + (Date.now() - t) + ' ms')
  })
  add(['runtime', 'uptime'], 'General', 'Tiempo que lleva encendido', async c => c.reply('⏱️ ' + uptime()))
  add(['info', 'botinfo'], 'General', 'Datos técnicos del bot', async c => {
    const mem = process.memoryUsage().rss / 1048576
    await c.reply('🤖 *' + botName(c.phone) + '*\n⏱️ Activo: ' + uptime() + '\n💾 Memoria: ' + mem.toFixed(0) + ' MB\n🟢 Node ' + process.version + '\n🌐 ' + SITE)
  })

  // ───── música y .play con metadatos y reacciones ─────
  add(['play', 'musica', 'p'], 'Música', 'Descarga una canción en audio', { usage: '<nombre o link>', heavy: true }, async c => {
    const q = c.text
    if (!q) return c.reply('Uso: `' + c.prefix + 'play` _nombre de la canción o link de YouTube / YT Music_\nEj: `' + c.prefix + 'play montagem apollo`')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')

    // Reacción inicial de búsqueda
    await c.sock.sendMessage(c.chat, { react: { text: '⏳', key: c.m.key } }).catch(() => {})

    try {
      await enqueue(async () => {
        const t0 = Date.now()
        const meta = await play.getAudioMetadataAndStream(q)
        if (!meta) return c.reply('❌ No encontré esa canción. Prueba con otro nombre.')

        // Reacción de descarga de audio
        await c.sock.sendMessage(c.chat, { react: { text: '📥', key: c.m.key } }).catch(() => {})

        const infoText = `,_ AUDIO ENCONTRADO _,
        
*[Nombre]*: ${meta.title}
*[Canal]*: ${meta.channel}
*[Vistas]*: ${meta.views}
*[Likes]*: ${meta.likes}
*[Año]*: ${meta.year}
*[Link]*: ${meta.url}`;

        // Enviar imagen en buena calidad con los detalles solicitados
        await c.sock.sendMessage(c.chat, {
          image: { url: meta.thumbnail },
          caption: infoText
        }, { quoted: c.m })

        const audioBuffer = await play.downloadBuffer(meta.directAudioUrl)
        let out = audioBuffer, mime = 'audio/mpeg', ext = 'mp3'

        if (FORMAT === 'm4a') {
          mime = 'audio/mp4'
          ext = 'm4a'
        } else {
          try { out = await toMp3(audioBuffer) } catch { mime = 'audio/mp4'; ext = 'm4a' }
        }

        const fname = ((meta.title || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'audio') + '.' + ext

        // Reacción final completada
        await c.sock.sendMessage(c.chat, { react: { text: '🎵', key: c.m.key } }).catch(() => {})

        await c.sock.sendMessage(c.chat, { audio: out, mimetype: mime, fileName: fname }, { quoted: c.m })
        console.log('⏱ play completo en ' + (Date.now() - t0) + ' ms')
      })
    } catch (e) {
      console.log('PLAY ERROR:', e.message)
      await c.sock.sendMessage(c.chat, { react: { text: '❌', key: c.m.key } }).catch(() => {})
      await c.reply('❌ ' + String(e.message || 'No pude descargar el audio').slice(0, 200)).catch(() => {})
    }
  })

  // ───── descargas de video: TikTok, Instagram, Facebook ─────
  function dl(kind, names, label, example) {
    add(names, 'Descargas', 'Descarga un video de ' + label, { usage: '<link>', heavy: true }, async c => {
      const q = c.ctx && c.ctx.quotedMessage
      const qt = (q && (q.conversation || (q.extendedTextMessage && q.extendedTextMessage.text))) || ''
      const url = social.findUrl(c.text) || social.findUrl(qt)
      if (!url || !social.hostOk(kind, url)) return c.reply('Uso: `' + c.prefix + names[0] + '` _link del video de ' + label + '_\nEj: `' + c.prefix + names[0] + '` ' + example)
      if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
      if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
      await c.sock.sendMessage(c.chat, { react: { text: '⏳', key: c.m.key } }).catch(() => {})
      try {
        await enqueue(async () => {
          const t0 = Date.now()
          const v = await social.video(kind, url)
          let buf = v.buf
          if (buf.slice(4, 8).toString() !== 'ftyp') {
            try { buf = await convert(buf, 'bin', 'mp4', ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', 'faststart'], 120000) }
            catch { throw new Error('El video no está en un formato compatible.') }
          }
          const cap = '🎬 ' + (v.title ? v.title.slice(0, 150) : label) + (v.by ? '\n👤 ' + v.by : '')
          await c.sock.sendMessage(c.chat, { video: buf, mimetype: 'video/mp4', caption: cap }, { quoted: c.m })
          await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
        })
      } catch (e) {
        await c.reply('❌ ' + social.friendly(kind, e)).catch(() => {})
      }
    })
  }
  dl('tt', ['tt', 'tiktok'], 'TikTok', 'https://vm.tiktok.com/xxxx')
  dl('ig', ['ig', 'instagram'], 'Instagram', 'https://www.instagram.com/reel/xxxx')
  dl('fb', ['fb', 'facebook'], 'Facebook', 'https://fb.watch/xxxx')
}
