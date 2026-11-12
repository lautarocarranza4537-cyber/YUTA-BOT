const config = require('./config')

async function play(c, kind) {
  try {
    if (!c.text) return c.reply(`Uso: .${kind === 'audio' ? 'play' : 'playvid'} nombre o link de YouTube`)
    await c.reply('🔎 Buscando en la API...')

    const apiUrl = config.apiUrl || 'http://localhost:3000'
    const query = encodeURIComponent(c.text)

    const res = await fetch(`${apiUrl}/api/search?q=${query}`)
    const v = await res.json()

    if (v.error) return c.reply('❌ Error: ' + v.error)
    if (!v.url) return c.reply('❌ No encontré resultados.')

    const caption =
      `╭─〔 🎧 *YUTA PLAY API* 〕\n` +
      `│ 🎵 *${v.title}*\n` +
      `│ 👤 ${v.author || '-'}\n` +
      `│ ⏱️ ${v.duration || '-'}\n` +
      `│ 👁️ ${(v.views || 0).toLocaleString('es-AR')} vistas\n` +
      `│ 🔗 ${v.url}\n` +
      `╰──────────────\n⏳ _Enviando archivo..._`

    try {
      await c.sock.sendMessage(c.chat, { image: { url: v.thumbnail }, caption }, { quoted: c.msg })
    } catch { await c.reply(caption) }

    const mediaUrl = `${apiUrl}/api/${kind}?q=${query}`

    if (kind === 'audio') {
      await c.sock.sendMessage(c.chat, { audio: { url: mediaUrl }, mimetype: 'audio/mp4', fileName: `${v.title}.m4a` }, { quoted: c.msg })
    } else {
      await c.sock.sendMessage(c.chat, { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: `🎬 ${v.title}` }, { quoted: c.msg })
    }

  } catch (e) {
    console.error('PLAY ERROR:', e)
    c.reply('❌ Error al conectar con la API de descargas.')
  }
}

module.exports = add => {
  add(['play', 'musica'], 'Descargas', 'Audio de YouTube vía API', { usage: '<nombre o link>' }, c => play(c, 'audio'))
  add(['playvid', 'video', 'play2'], 'Descargas', 'Video de YouTube vía API', { usage: '<nombre o link>' }, c => play(c, 'video'))
}
