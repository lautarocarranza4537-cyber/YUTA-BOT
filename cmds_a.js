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

  add(['owner', 'creador', 'dueno'], 'General', 'Contacto del creador', async c => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:L9kas|owner\nORG:L9kas|owner;\nTEL;type=CELL;type=VOICE;waid=5493513157041:+54 9 351 315 7041\nEND:VCARD'
    await c.sock.sendMessage(c.chat, { contacts: { displayName: 'L9kas|owner', contacts: [{ vcard }] } }, { quoted: c.m })
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

  // ───── música ─────
  async function findSong(q) {
    const m = q.match(YT)
    if (m) {
      const id = m[1]
      try {
        const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://youtu.be/' + id) + '&format=json', { signal: AbortSignal.timeout(8000) })
        const j = await r.json()
        return { id, title: j.title, by: j.author_name, img: j.thumbnail_url }
      } catch { return { id, title: '', by: '-', img: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' } }
    }
    return fast.top(q)
  }

  add(['play', 'musica', 'p'], 'Música', 'Descarga una canción en audio', { usage: '<nombre o link>', heavy: true }, async c => {
    const q = c.text
    if (!q) return c.reply('Uso: `' + c.prefix + 'play` _nombre de la canción o link de YouTube_\nEj: `' + c.prefix + 'play montagem apollo`')
    if (pending() >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
    if (pending() > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
    await c.sock.sendMessage(c.chat, { react: { text: '🔎', key: c.m.key } }).catch(() => {})
    try {
      await enqueue(async () => {
        const t0 = Date.now()
        const item = await findSong(q)
        if (!item) return c.reply('❌ No encontré esa canción. Prueba con otro nombre.')
        if (durSec(item.dur) > MAX_MIN * 60) return c.reply('❌ Esa canción es muy larga (máx ' + MAX_MIN + ' min).')
        const t1 = Date.now()
        const cap = '╭─〔 🎧 *' + botName(c.phone) + '* 〕\n│ 🎵 *' + (item.title || 'Audio de YouTube') + '*\n│ 👤 ' + (item.by || '-') + (item.dur ? '\n│ ⏱️ ' + item.dur : '') + '\n╰──────────────\n⏳ _Descargando el audio..._'
        const card = (async () => {
          try { await c.sock.sendMessage(c.chat, { image: { url: item.img }, caption: cap }, { quoted: c.m }) } catch { await c.reply(cap) }
        })()
        const a = await play.audio(item.u ? '' : item.id, item.u || '', item.title)
        const t2 = Date.now()
        let out = a.buf, mime = 'audio/mpeg', ext = 'mp3'
        if (FORMAT === 'm4a' && !/mpeg|mp3/i.test(a.ct)) { mime = 'audio/mp4'; ext = 'm4a' }
        else if (!/mpeg|mp3/i.test(a.ct)) {
          try { out = await toMp3(a.buf) } catch (e) { console.log('⚠ sin conversión a mp3:', e.message); mime = 'audio/mp4'; ext = 'm4a' }
        }
        const t3 = Date.now()
        await card
        const fname = ((item.title || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'audio') + '.' + ext
        await c.sock.sendMessage(c.chat, { audio: out, mimetype: mime, fileName: fname }, { quoted: c.m })
        await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
        console.log('⏱ búsqueda ' + (t1 - t0) + ' ms | descarga ' + (t2 - t1) + ' ms | conversión ' + (t3 - t2) + ' ms | envío ' + (Date.now() - t3) + ' ms | total ' + (Date.now() - t0) + ' ms')
      })
    } catch (e) {
      console.log('PLAY ERROR:', e.message)
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
          console.log('⏱ ' + kind + ' (' + v.via + ') ' + (Date.now() - t0) + ' ms | ' + (buf.length / 1048576).toFixed(1) + ' MB')
        })
      } catch (e) {
        console.log('DL ERROR', kind, e.message)
        await c.reply('❌ ' + social.friendly(kind, e)).catch(() => {})
      }
    })
  }
  dl('tt', ['tt', 'tiktok'], 'TikTok', 'https://vm.tiktok.com/xxxx')
  dl('ig', ['ig', 'instagram'], 'Instagram', 'https://www.instagram.com/reel/xxxx')
  dl('fb', ['fb', 'facebook'], 'Facebook', 'https://fb.watch/xxxx')
}
