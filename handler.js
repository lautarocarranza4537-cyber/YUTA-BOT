const playMod = require('./play')
const cmds = new Map()

function add(triggers, category, desc, fn) {
  triggers.forEach(t => cmds.set(t, { category, desc, fn }))
}

const groupStatus = new Map()

// Menú épico usando * _ , sin emojis
add(['menu', 'help'], 'General', 'Muestra el panel interactivo', async (sock, msg) => {
  const jid = msg.key.remoteJid
  const menuText = `,_ YUTA BOT - SPECIAL GRADE _,
  
,_ MENU DE COMANDOS _,
  
,_.play <cancion>_
_Busca y descarga audio m4a de YouTube e YT Music con metadatos completos._

,_.playaudio <cancion>_
_Envía la canción directamente en formato de nota de voz de WhatsApp._

,_.pin <busqueda>_
_Busca imágenes en alta definición desde Pinterest._

,_.pinvideo <busqueda>_
_Busca videos limpios en formato MP4 desde Pinterest._

,_.ping_
_Comprueba la latencia del servidor._

,_.owner_
_Muestra la tarjeta de contacto oficial corporativa de L9kas._

,_.bot <on/off>_
_Activa o desactiva las funciones del bot en chats grupales._`;

  await sock.sendMessage(jid, { text: menuText }, { quoted: msg })
})

add(['ping'], 'General', 'Latencia', async (sock, msg) => {
  const jid = msg.key.remoteJid
  const t0 = Date.now()
  const sent = await sock.sendMessage(jid, { text: ',_ Calculando latencia..._' }, { quoted: msg })
  const lat = Date.now() - t0
  await sock.sendMessage(jid, { text: `,_ PONG: ${lat}ms _` }, { edit: sent.key })
})

// Owner con tarjeta de contacto empresarial L9kas
add(['owner'], 'General', 'Propietario', async (sock, msg) => {
  const jid = msg.key.remoteJid
  const vcard = 'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    'FN:L9kas | owner\n' +
    'ORG:L9kas Enterprise;\n' +
    'TEL;type=CELL;type=VOICE;waid=5493510000000:+54 9 351 000 0000\n' +
    'END:VCARD'

  await sock.sendMessage(jid, {
    contacts: {
      displayName: 'L9kas | owner',
      contacts: [{ vcard }]
    }
  }, { quoted: msg })

  await sock.sendMessage(jid, {
    text: `,_ L9kas | owner _,
    
_Ver contacto arriba._
_Ver empresa: L9kas Enterprise_`
  }, { quoted: msg })
})

add(['bot'], 'Grupo', 'Control grupal', async (sock, msg, args) => {
  const jid = msg.key.remoteJid
  const opt = (args[0] || '').toLowerCase()
  if (opt === 'on') {
    groupStatus.set(jid, true)
    await sock.sendMessage(jid, { text: ',_ Yuta Bot activado en este grupo _' }, { quoted: msg })
  } else if (opt === 'off') {
    groupStatus.set(jid, false)
    await sock.sendMessage(jid, { text: ',_ Yuta Bot desactivado en este grupo _' }, { quoted: msg })
  } else {
    await sock.sendMessage(jid, { text: ',_ Uso: .bot on o .bot off _' }, { quoted: msg })
  }
})

// COMANDO .PLAY (Con reacciones de descarga, descarga previa m4a y metadatos completos)
add(['play'], 'Música', 'Reproduce streaming o descarga audio', async (sock, msg, args) => {
  const jid = msg.key.remoteJid
  const query = args.join(' ')
  if (!query) return sock.sendMessage(jid, { text: ',_ Escribe el nombre o link de la cancion _' }, { quoted: msg })

  // Reacción de descarga inicial (magia / lupa)
  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } })

  try {
    const meta = await playMod.getAudioMetadataAndStream(query)
    
    // Reacción de procesamiento de audio m4a
    await sock.sendMessage(jid, { react: { text: '📥', key: msg.key } })

    const infoText = `,_ AUDIO ENCONTRADO _,
    
*[Nombre]*: ${meta.title}
*[Canal]*: ${meta.channel}
*[Vistas]*: ${meta.views}
*[Likes]*: ${meta.likes}
*[Año]*: ${meta.year}
*[Link]*: ${meta.url}`;

    // Enviar imagen en buena calidad con los metadatos pedidos
    await sock.sendMessage(jid, {
      image: { url: meta.thumbnail },
      caption: infoText
    }, { quoted: msg })

    // Descargar buffer m4a antes de enviar el audio
    const audioBuffer = await playMod.downloadBuffer(meta.directAudioUrl)

    // Reacción final completada
    await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } })

    // Enviar archivo de audio m4a directo
    await sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      fileName: `${meta.title}.m4a`
    }, { quoted: msg })

  } catch (e) {
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } })
    await sock.sendMessage(jid, { text: ',_ Error al procesar la descarga de la cancion _' }, { quoted: msg })
  }
})

// COMANDO .PLAYAUDIO (Nota de voz con reacciones)
add(['playaudio', 'pya'], 'Descargas', 'Envía audio como nota de voz', async (sock, msg, args) => {
  const jid = msg.key.remoteJid
  const query = args.join(' ')
  if (!query) return sock.sendMessage(jid, { text: ',_ Uso: .playaudio <cancion> _' }, { quoted: msg })

  await sock.sendMessage(jid, { react: { text: '🎙️', key: msg.key } })

  try {
    const meta = await playMod.getAudioMetadataAndStream(query)
    const audioBuffer = await playMod.downloadBuffer(meta.directAudioUrl)

    await sock.sendMessage(jid, { react: { text: '🔊', key: msg.key } })
    await sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      ptt: true
    }, { quoted: msg })
  } catch {
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } })
    await sock.sendMessage(jid, { text: ',_ Error al enviar nota de voz _' }, { quoted: msg })
  }
})

// COMANDO .PIN Y .PINVIDEO
add(['pin', 'pinterest'], 'Descargas', 'Pinterest imagen', async (sock, msg, args) => {
  const jid = msg.key.remoteJid
  const q = args.join(' ')
  if (!q) return sock.sendMessage(jid, { text: ',_ Uso: .pin <busqueda> _' }, { quoted: msg })
  await sock.sendMessage(jid, { react: { text: '📌', key: msg.key } })
  try {
    const res = await fetch(`https://itzpire.com/search/pinterest?query=${encodeURIComponent(q)}`)
    const json = await res.json()
    const list = json.result || json.data || []
    const item = list.find(x => typeof x === 'string' || x.image) || list[0]
    const url = typeof item === 'string' ? item : (item?.image || item?.url)
    if (!url) throw new Error()
    await sock.sendMessage(jid, { image: { url }, caption: `,_ Pinterest: ${q} _` }, { quoted: msg })
  } catch {
    await sock.sendMessage(jid, { text: ',_ No se encontro imagen _' }, { quoted: msg })
  }
})

add(['pinvideo'], 'Descargas', 'Pinterest video', async (sock, msg, args) => {
  const jid = msg.key.remoteJid
  const q = args.join(' ')
  if (!q) return sock.sendMessage(jid, { text: ',_ Uso: .pinvideo <busqueda> _' }, { quoted: msg })
  await sock.sendMessage(jid, { react: { text: '🎬', key: msg.key } })
  try {
    const res = await fetch(`https://itzpire.com/search/pinterest?query=${encodeURIComponent(q)}`)
    const json = await res.json()
    const list = json.result || json.data || []
    const item = list.find(x => x.video || (x.url && x.url.includes('.mp4')))
    if (!item) throw new Error()
    await sock.sendMessage(jid, { video: { url: item.video || item.url }, caption: `,_ Pin Video: ${q} _` }, { quoted: msg })
  } catch {
    await sock.sendMessage(jid, { text: ',_ No se encontro video _' }, { quoted: msg })
  }
})

module.exports = async (sock, msg) => {
  const content = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
  if (!content.startsWith('.')) return
  const args = content.slice(1).trim().split(/ +/)
  const command = args.shift().toLowerCase()

  const cmdObj = cmds.get(command)
  if (!cmdObj) return

  const jid = msg.key.remoteJid
  const isGroup = jid.endsWith('@g.us')
  if (isGroup && command !== 'bot') {
    if (groupStatus.get(jid) === false) return
  }

  try {
    await cmdObj.fn(sock, msg, args)
  } catch (err) {
    console.error(`Error en .${command}:`, err)
  }
}
