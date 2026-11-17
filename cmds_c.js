const fs = require('fs')
const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys')

module.exports = H => {
  const { add, num, pick, rnd, nekos, dirOf, bannerFile, dbOf, saveDb, grp, cleanName, convert, toWebp, addExif, toOpus, gifToMp4, LANGS, googleTTS, botName } = H

  // ───── anime ─────
  for (const cat of ['neko', 'waifu', 'husbando', 'kitsune']) {
    add([cat], 'Anime', 'Imagen de ' + cat, { heavy: true }, async c => {
      await c.sock.sendMessage(c.chat, { image: { url: await nekos(cat) }, caption: '✨ ' + cat }, { quoted: c.m })
    })
  }
  const ACT = {
    hug: ['abrazó a', 'abrazó a todos'], kiss: ['besó a', 'mandó besos a todos'], pat: ['acarició a', 'acarició a todos'],
    slap: ['abofeteó a', 'abofeteó al aire'], cuddle: ['acurrucó a', 'quiere acurrucarse con alguien'], poke: ['picó a', 'picó a todos'],
    cry: ['está llorando por', 'está llorando'], dance: ['baila con', 'está bailando'], bite: ['mordió a', 'mordió al aire'],
    highfive: ['chocó los cinco con', 'chocó los cinco con todos'], wave: ['saludó a', 'saludó a todos'], blush: ['se sonrojó con', 'se sonrojó'],
    laugh: ['se ríe de', 'se ríe'], smile: ['le sonrió a', 'sonríe'], wink: ['le guiñó el ojo a', 'guiñó el ojo'],
    punch: ['golpeó a', 'golpeó al aire'], patada: ['pateó a', 'pateó al aire'], tickle: ['le hizo cosquillas a', 'hace cosquillas a todos'],
    feed: ['le dio de comer a', 'da de comer a todos'], handhold: ['le agarró la mano a', 'quiere agarrar la mano de alguien'],
    sleep: ['se durmió con', 'se durmió'], pout: ['hace pucheros con', 'hace pucheros'], facepalm: ['se golpeó la cara por', 'se golpeó la cara'],
    shrug: ['se encogió de hombros con', 'se encogió de hombros'], baka: ['le dijo baka a', 'dijo baka']
  }
  for (const [cat, [con, solo]] of Object.entries(ACT)) {
    add([cat], 'Anime', 'Reacción ' + cat, { react: true, heavy: true, usage: '[@usuario]' }, async c => {
      const me = jidNormalizedUser(c.sender)
      const tg = c.target ? jidNormalizedUser(c.target) : null
      const caption = tg ? '💞 @' + num(me) + ' ' + con + ' @' + num(tg) : '💞 @' + num(me) + ' ' + solo
      const mentions = tg ? [me, tg] : [me]
      const url = await nekos(cat === 'patada' ? 'kick' : cat)
      const gif = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(20000) })).arrayBuffer())
      let mp4 = null
      try { mp4 = await gifToMp4(gif) } catch {}
      if (mp4) await c.sock.sendMessage(c.chat, { video: mp4, gifPlayback: true, caption, mentions }, { quoted: c.m })
      else await c.sock.sendMessage(c.chat, { image: gif, caption, mentions }, { quoted: c.m })
    })
  }

  // ───── juegos ─────
  add(['coinflip', 'moneda'], 'Juegos', 'Lanza una moneda', async c => c.reply('🪙 ' + pick(['Cara', 'Cruz'])))
  add(['dado', 'dice'], 'Juegos', 'Lanza un dado', async c => c.reply('🎲 ' + (1 + Math.floor(Math.random() * 6))))
  add(['ppt'], 'Juegos', 'Piedra, papel o tijera', { usage: 'piedra|papel|tijera' }, async c => {
    const o = ['piedra', 'papel', 'tijera']
    const u = (c.args[0] || '').toLowerCase()
    if (!o.includes(u)) return c.reply('Uso: `' + c.prefix + 'ppt` _piedra_, _papel_ o _tijera_')
    const b = pick(o)
    const win = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' }
    await c.reply('Tú: ' + u + '\nBot: ' + b + '\n\n' + (u === b ? 'Empate 🤝' : win[u] === b ? 'Ganaste 🎉' : 'Perdiste 😹'))
  })
  add(['8ball', 'bola8'], 'Juegos', 'Responde una pregunta de sí o no', { usage: '<pregunta>' }, async c => {
    if (!c.text) return c.reply('Hazme una pregunta.')
    await c.reply('🎱 ' + pick(['Sí', 'No', 'Quizás', 'Definitivamente', 'Ni de broma', 'Pregunta luego', 'Todo apunta a que sí']))
  })
  add(['love', 'ship'], 'Juegos', 'Compatibilidad entre dos personas', { usage: '@usuario' }, async c => {
    const t = c.target ? '@' + num(c.target) : (c.text || 'alguien')
    await c.reply('💘 @' + num(c.sender) + ' + ' + t + ' = *' + rnd() + '%*', [c.sender, ...(c.target ? [c.target] : [])])
  })
  add(['gay', 'cute', 'simp'], 'Juegos', 'Porcentaje aleatorio, de broma', { usage: '[@usuario]' }, async c => {
    const t = c.target || c.sender
    await c.reply('📊 @' + num(t) + ' es ' + rnd() + '%', [t])
  })
  add(['chiste'], 'Juegos', 'Cuenta un chiste', async c => c.reply('😂 ' + pick([
    '¿Qué le dice un jardinero a otro? Disfrutemos mientras podamos.',
    '¿Por qué los pájaros vuelan al sur? Porque caminando tardarían mucho.',
    '¿Qué hace una abeja en el gimnasio? Zum-ba.',
    '¿Cómo se llama el campeón de buceo japonés? Tokofondo.',
    '¿Qué le dice un cero a un ocho? Bonito cinturón.'
  ])))

  // ───── herramientas ─────
  add(['calc'], 'Herramientas', 'Resuelve operaciones matemáticas', { usage: '<operación>' }, async c => {
    const e = c.text.replace(/[^0-9+\-*/().%\s]/g, '')
    if (!e) return c.reply('Uso: `' + c.prefix + 'calc` _2+2*5_')
    try { await c.reply('🧮 ' + Function('"use strict";return (' + e + ')')()) } catch { await c.reply('Expresión inválida.') }
  })
  add(['sticker', 's'], 'Herramientas', 'Convierte imagen o video corto en sticker', { usage: '[paquete|autor]', heavy: true }, async c => {
    let m, inner, isVideo
    for (const x of [c.quoted, c.m]) {
      const cc = x && x.message && (x.message.ephemeralMessage ? x.message.ephemeralMessage.message : x.message)
      const i = cc && (cc.imageMessage || cc.videoMessage)
      if (i) { m = x; inner = i; isVideo = !!cc.videoMessage; break }
    }
    if (!m) return c.reply('Envía o responde a una imagen o video con `' + c.prefix + 's`.')
    await c.sock.sendMessage(c.chat, { react: { text: '⏳', key: c.m.key } }).catch(() => {})
    const buf = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage })
    const mime = (inner.mimetype || '').split(';')[0]
    const ext = isVideo ? 'mp4' : ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime] || 'jpg')
    const [pk, au] = c.text.split('|').map(s => s.trim())
    const out = await addExif(await toWebp(buf, isVideo, ext), pk || botName(c.phone), au || 'Yuta')
    await c.sock.sendMessage(c.chat, { sticker: out }, { quoted: c.m })
    await c.sock.sendMessage(c.chat, { react: { text: '✅', key: c.m.key } }).catch(() => {})
  })
  add(['toimg', 'img'], 'Herramientas', 'Convierte un sticker en imagen', async c => {
    const st = c.quoted && c.quoted.message && c.quoted.message.stickerMessage
    if (!st) return c.reply('Responde a un sticker con `' + c.prefix + 'toimg`.')
    if (st.isAnimated) return c.reply('Por ahora solo convierto stickers estáticos.')
    const buf = await downloadMediaMessage(c.quoted, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage })
    await c.sock.sendMessage(c.chat, { image: await convert(buf, 'webp', 'png', []) }, { quoted: c.m })
  })
  add(['tts', 'voz'], 'Herramientas', 'Convierte texto en nota de voz', { usage: '[idioma] <texto>', heavy: true }, async c => {
    const q = c.ctx && c.ctx.quotedMessage
    const qt = (q && (q.conversation || (q.extendedTextMessage && q.extendedTextMessage.text))) || ''
    const args = [...c.args]
    let lang = 'es'
    if (args[0] && LANGS.has(args[0].toLowerCase()) && (args.length > 1 || qt)) lang = args.shift().toLowerCase()
    const text = (args.join(' ') || qt).trim().slice(0, 400)
    if (!text) return c.reply('Escribe el texto: `' + c.prefix + 'tts` _hola, ¿cómo estás?_\nOtro idioma: `' + c.prefix + 'tts` _en hello_')
    const mp3 = await googleTTS(text, lang)
    let opus = null
    try { opus = await toOpus(mp3) } catch {}
    if (opus) await c.sock.sendMessage(c.chat, { audio: opus, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: c.m })
    else await c.sock.sendMessage(c.chat, { audio: mp3, mimetype: 'audio/mpeg' }, { quoted: c.m })
  })
  add(['pfp', 'perfil'], 'Herramientas', 'Foto de perfil de alguien', { usage: '[@usuario]' }, async c => {
    const t = c.target || c.sender
    try {
      const url = await c.sock.profilePictureUrl(t, 'image')
      await c.sock.sendMessage(c.chat, { image: { url }, caption: '🖼️ @' + num(t), mentions: [t] }, { quoted: c.m })
    } catch { await c.reply('No tiene foto de perfil o es privada.') }
  })
  add(['say', 'decir'], 'Herramientas', 'El bot repite tu texto', { usage: '<texto>' }, async c => {
    if (!c.text) return c.reply('Escribe algo.')
    await c.reply(c.text)
  })
  add(['id', 'jid'], 'Herramientas', 'ID del chat actual', async c => c.reply(c.chat))

  // ───── owner (la cuenta vinculada) ─────
  const OW = { owner: true }

  add(['bot'], 'Owner', 'Enciende o apaga el bot en este grupo', { ...OW, group: true, nometa: true, usage: 'on|off' }, async c => {
    const g = grp(c.phone, c.chat)
    const v = (c.args[0] || '').toLowerCase()
    if (v !== 'on' && v !== 'off') return c.reply('El bot está *' + (g.on ? 'encendido' : 'apagado') + '* en este grupo.\nUso: `' + c.prefix + 'bot on` o `' + c.prefix + 'bot off`')
    g.on = v === 'on'
    saveDb(c.phone)
    await c.reply(g.on ? '✅ Bot encendido: todos pueden usarlo en este grupo.' : '⛔ Bot apagado: solo tú puedes usarlo en este grupo.')
  })
  add(['setbanner', 'setmenu'], 'Owner', 'Cambia la imagen del menú (responde a una foto)', OW, async c => {
    let m = null
    for (const x of [c.quoted, c.m]) {
      const cc = x && x.message && (x.message.ephemeralMessage ? x.message.ephemeralMessage.message : x.message)
      if (cc && cc.imageMessage) { m = x; break }
    }
    if (!m) return c.reply('Responde a una imagen con `' + c.prefix + 'setbanner` (o envía la imagen con ese texto).')
    const buf = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage })
    if (buf.length > 3 * 1024 * 1024) return c.reply('La imagen es muy pesada (máx 3 MB).')
    fs.mkdirSync(dirOf(c.phone), { recursive: true })
    fs.writeFileSync(bannerFile(c.phone), buf)
    await c.reply('✅ Banner actualizado. Pruébalo con `' + c.prefix + 'menu`')
  })
  add(['delbanner', 'resetbanner'], 'Owner', 'Quita tu banner y vuelve al de por defecto', OW, async c => {
    try { fs.unlinkSync(bannerFile(c.phone)) } catch {}
    await c.reply('✅ Banner restablecido.')
  })
  add(['botname', 'nombrebot'], 'Owner', 'Cambia el nombre del bot', { ...OW, usage: '<nombre>' }, async c => {
    const n = cleanName(c.text)
    if (!n) return c.reply('Uso: `' + c.prefix + 'botname` _nombre_')
    dbOf(c.phone).name = n
    saveDb(c.phone)
    await c.reply('✅ Ahora me llamo *' + n + '*')
  })
  add(['modo', 'mode'], 'Owner', 'Público: responde a todos. Privado: solo a ti', { ...OW, usage: 'public|self' }, async c => {
    if (!['public', 'self'].includes(c.args[0])) return c.reply('Uso: `' + c.prefix + 'modo` _public_ o _self_')
    dbOf(c.phone).mode = c.args[0]
    saveDb(c.phone)
    await c.reply('Modo: ' + (c.args[0] === 'self' ? 'privado' : 'público'))
  })
  add(['grupos'], 'Owner', 'Lista los grupos donde está el bot', OW, async c => {
    const g = Object.values(await c.sock.groupFetchAllParticipating())
    await c.reply(g.map(x => '› ' + x.subject + ' (' + x.participants.length + ')').join('\n') || 'Ninguno')
  })
  add(['salir', 'leave'], 'Owner', 'El bot sale del grupo actual', { ...OW, group: true, nometa: true }, async c => {
    await c.sock.groupLeave(c.chat)
  })
}
