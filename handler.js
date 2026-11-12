const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const config = require('./config')
const db = require('./db')

const start = Date.now()
const num = j => (j || '').split('@')[0].split(':')[0]
const pick = a => a[Math.floor(Math.random() * a.length)]
const sameUser = (p, jid) => [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean).some(x => num(x) === num(jid))

function getBody(msg) {
  let c = msg.message
  c = c?.ephemeralMessage?.message || c?.viewOnceMessage?.message || c
  return c?.conversation || c?.extendedTextMessage?.text || c?.imageMessage?.caption || c?.videoMessage?.caption || ''
}
const getCtx = msg => {
  const c = msg.message
  const inner = c?.ephemeralMessage?.message || c
  return Object.values(inner || {})[0]?.contextInfo || {}
}

async function nekos(cat) {
  const r = await fetch(`https://nekos.best/api/v2/${cat}`)
  const j = await r.json()
  return j.results[0].url
}

const commands = {}
const add = (names, category, desc, opts, run) => {
  if (typeof opts === 'function') { run = opts; opts = {} }
  const cmd = { names, category, desc, ...opts, run }
  names.forEach(n => (commands[n] = cmd))
}

// Cargar módulo de descargas play
require('./play')(add)

// ── General
add(['menu', 'help', 'ayuda'], 'General', 'Muestra este menú', async c => {
  const cats = {}
  const seen = new Set()
  for (const cmd of Object.values(commands)) {
    if (seen.has(cmd)) continue
    seen.add(cmd)
    ;(cats[cmd.category] ??= []).push(cmd)
  }
  let t = `╭━━━『 *${config.botName}* 』━━━\n┃ 👤 Hola @${num(c.sender)}\n┃ 🔰 Prefijos: ${config.prefixes.join('  ')}\n┃ ⚙️ Modo: ${db.data.mode}\n╰━━━━━━━━━━━━━━\n`
  for (const [cat, list] of Object.entries(cats)) {
    t += `\n┏━━『 ${cat} 』\n` + list.map(x => `┃ ➤ ${x.names[0]}${x.names[1] ? ` (${x.names.slice(1).join(', ')})` : ''}\n┃    ${x.desc}`).join('\n') + '\n┗━━━━━━━━'
  }
  await c.reply(t, [c.sender])
})
add(['ping', 'speed'], 'General', 'Velocidad del bot', async c => {
  const t = Date.now()
  await c.reply('🏓 Pong!')
  await c.reply(`⚡ ${Date.now() - t} ms`)
})
add(['runtime', 'uptime'], 'General', 'Tiempo activo', async c => {
  const s = Math.floor((Date.now() - start) / 1000)
  await c.reply(`⏱️ ${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m ${s % 60}s`)
})
add(['owner', 'creador'], 'General', 'Contacto del dueño', async c => {
  await c.reply(`👑 Dueño: wa.me/${config.owners[0]}`)
})

// ── Grupo
add(['tagall', 'todos'], 'Grupo', 'Menciona a todos', { group: true, admin: true }, async c => {
  const ids = c.meta.participants.map(p => p.id)
  await c.reply(`📢 *${c.text || 'Atención'}*\n\n` + ids.map(i => `➤ @${num(i)}`).join('\n'), ids)
})
add(['hidetag', 'notify'], 'Grupo', 'Mensaje oculto a todos', { group: true, admin: true }, async c => {
  await c.sock.sendMessage(c.chat, { text: c.text || '📢', mentions: c.meta.participants.map(p => p.id) })
})
add(['kick', 'echar'], 'Grupo', 'Expulsa (responde/menciona)', { group: true, admin: true, botAdmin: true }, async c => {
  if (!c.target) return c.reply('Menciona o responde a alguien.')
  await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'remove')
})
add(['add', 'agregar'], 'Grupo', 'Agrega un número', { group: true, admin: true, botAdmin: true }, async c => {
  const n = c.args[0]?.replace(/\D/g, '')
  if (!n) return c.reply('Uso: .add 5493510000000')
  await c.sock.groupParticipantsUpdate(c.chat, [n + '@s.whatsapp.net'], 'add')
})
add(['promote', 'daradmin'], 'Grupo', 'Da admin', { group: true, admin: true, botAdmin: true }, async c => {
  if (!c.target) return c.reply('Menciona o responde a alguien.')
  await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'promote')
  await c.reply('✅ Ahora es admin.')
})
add(['demote', 'quitaradmin'], 'Grupo', 'Quita admin', { group: true, admin: true, botAdmin: true }, async c => {
  if (!c.target) return c.reply('Menciona o responde a alguien.')
  await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'demote')
  await c.reply('✅ Ya no es admin.')
})
add(['link', 'enlace'], 'Grupo', 'Link del grupo', { group: true, botAdmin: true }, async c => {
  await c.reply('🔗 https://chat.whatsapp.com/' + (await c.sock.groupInviteCode(c.chat)))
})
add(['revoke', 'resetlink'], 'Grupo', 'Restablece el link', { group: true, admin: true, botAdmin: true }, async c => {
  await c.sock.groupRevokeInvite(c.chat)
  await c.reply('✅ Link restablecido.')
})
add(['grupo', 'group'], 'Grupo', 'abrir / cerrar', { group: true, admin: true, botAdmin: true }, async c => {
  const o = c.args[0]
  if (!['abrir', 'cerrar'].includes(o)) return c.reply('Uso: .grupo abrir | cerrar')
  await c.sock.groupSettingUpdate(c.chat, o === 'abrir' ? 'not_announcement' : 'announcement')
  await c.reply(o === 'abrir' ? '🔓 Grupo abierto' : '🔒 Grupo cerrado')
})
add(['setname'], 'Grupo', 'Cambia nombre del grupo', { group: true, admin: true, botAdmin: true }, async c => {
  if (!c.text) return c.reply('Escribe el nuevo nombre.')
  await c.sock.groupUpdateSubject(c.chat, c.text)
})
add(['setdesc'], 'Grupo', 'Cambia descripción', { group: true, admin: true, botAdmin: true }, async c => {
  await c.sock.groupUpdateDescription(c.chat, c.text)
})
add(['admins'], 'Grupo', 'Lista de admins', { group: true }, async c => {
  const a = c.meta.participants.filter(p => p.admin).map(p => p.id)
  await c.reply('👮 *Admins*\n' + a.map(i => `➤ @${num(i)}`).join('\n'), a)
})
add(['del', 'delete'], 'Grupo', 'Borra mensaje (responde a él)', { group: true, admin: true, botAdmin: true }, async c => {
  const x = c.ctx
  if (!x.stanzaId) return c.reply('Responde al mensaje a borrar.')
  await c.sock.sendMessage(c.chat, { delete: { remoteJid: c.chat, fromMe: false, id: x.stanzaId, participant: x.participant } })
})
add(['welcome', 'bienvenida'], 'Grupo', 'on/off bienvenida', { group: true, admin: true }, async c => {
  const v = c.args[0]
  if (!['on', 'off'].includes(v)) return c.reply('Uso: .welcome on | off')
  db.group(c.chat).welcome = v === 'on'; db.save()
  await c.reply(`Bienvenida: ${v}`)
})
add(['antilink'], 'Grupo', 'on/off antilink', { group: true, admin: true, botAdmin: true }, async c => {
  const v = c.args[0]
  if (!['on', 'off'].includes(v)) return c.reply('Uso: .antilink on | off')
  db.group(c.chat).antilink = v === 'on'; db.save()
  await c.reply(`Antilink: ${v}`)
})

// ── Anime
for (const cat of ['neko', 'waifu', 'husbando', 'kitsune']) {
  add([cat], 'Anime', `Imagen de ${cat}`, async c => {
    await c.sock.sendMessage(c.chat, { image: { url: await nekos(cat) }, caption: `✨ ${cat}` }, { quoted: c.msg })
  })
}
const actions = { hug: 'abrazó a', kiss: 'besó a', pat: 'acarició a', slap: 'abofeteó a', cuddle: 'acurrucó a', poke: 'picó a', cry: 'está llorando por', dance: 'baila con', bite: 'mordió a', highfive: 'chocó los cinco con' }
for (const [cat, txt] of Object.entries(actions)) {
  add([cat], 'Anime', `Reacción: ${cat}`, async c => {
    const who = c.target ? `@${num(c.target)}` : 'todos'
    await c.sock.sendMessage(c.chat, {
      image: { url: await nekos(cat) },
      caption: `💞 @${num(c.sender)} ${txt} ${who}`,
      mentions: [c.sender, ...(c.target ? [c.target] : [])]
    }, { quoted: c.msg })
  })
}

// ── Juegos
add(['coinflip', 'moneda'], 'Juegos', 'Cara o cruz', async c => c.reply(`🪙 ${pick(['Cara', 'Cruz'])}`))
add(['dado', 'dice'], 'Juegos', 'Tira un dado', async c => c.reply(`🎲 ${1 + Math.floor(Math.random() * 6)}`))
add(['ppt'], 'Juegos', 'Piedra, papel o tijera', async c => {
  const o = ['piedra', 'papel', 'tijera']
  const u = c.args[0]?.toLowerCase()
  if (!o.includes(u)) return c.reply('Uso: .ppt piedra | papel | tijera')
  const b = pick(o)
  const win = { piedra: 'tijera', papel: 'piedra', tijera: 'papel' }
  const r = u === b ? 'Empate 🤝' : win[u] === b ? 'Ganaste 🎉' : 'Perdiste 😹'
  await c.reply(`Tú: ${u}\nBot: ${b}\n\n${r}`)
})
add(['8ball', 'bola8'], 'Juegos', 'Pregunta a la bola mágica', async c => {
  if (!c.text) return c.reply('Hazme una pregunta.')
  await c.reply('🎱 ' + pick(['Sí', 'No', 'Quizás', 'Definitivamente', 'Ni de broma', 'Pregunta luego', 'Todo apunta a que sí']))
})
add(['love', 'ship'], 'Juegos', 'Compatibilidad', async c => {
  const t = c.target ? `@${num(c.target)}` : c.text || 'alguien'
  await c.reply(`💘 @${num(c.sender)} + ${t} = *${Math.floor(Math.random() * 101)}%*`, [c.sender, ...(c.target ? [c.target] : [])])
})
add(['gay', 'pajero', 'cute'], 'Juegos', 'Porcentaje random', async c => {
  const t = c.target || c.sender
  await c.reply(`📊 @${num(t)} es ${Math.floor(Math.random() * 101)}%`, [t])
})
add(['calc'], 'Juegos', 'Calculadora', async c => {
  const e = c.text.replace(/[^0-9+\-*/().%\s]/g, '')
  if (!e) return c.reply('Uso: .calc 2+2*5')
  try { await c.reply('🧮 ' + Function(`"use strict";return (${e})`)()) } catch { await c.reply('Expresión inválida.') }
})

// ── Herramientas
add(['sticker', 's'], 'Herramientas', 'Imagen/video → sticker', async c => {
  const m = c.quotedMsg || c.msg
  const inner = m.message?.imageMessage || m.message?.videoMessage
  if (!inner) return c.reply('Envía o responde a una imagen/video con .s')
  let Sticker
  try { Sticker = require('wa-sticker-formatter').Sticker } catch { return c.reply('Falta wa-sticker-formatter.') }
  const buf = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage })
  const st = new Sticker(buf, { pack: config.packname, author: config.author, type: 'full', quality: 60 })
  await c.sock.sendMessage(c.chat, await st.toMessage(), { quoted: c.msg })
})
add(['toimg'], 'Herramientas', 'Sticker → imagen', async c => {
  const m = c.quotedMsg
  if (!m?.message?.stickerMessage) return c.reply('Responde a un sticker.')
  const buf = await downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage })
  await c.sock.sendMessage(c.chat, { image: buf }, { quoted: c.msg })
})
add(['id', 'jid'], 'Herramientas', 'ID del chat', async c => c.reply(c.chat))

// ── Owner
add(['modo', 'mode'], 'Owner', 'public / self', { owner: true }, async c => {
  if (!['public', 'self'].includes(c.args[0])) return c.reply('Uso: .modo public | self')
  db.data.mode = c.args[0]; db.save()
  await c.reply('Modo: ' + c.args[0])
})
add(['broadcast', 'bc'], 'Owner', 'Mensaje a todos los grupos', { owner: true }, async c => {
  if (!c.text) return c.reply('Escribe el mensaje.')
  const gs = Object.keys(await c.sock.groupFetchAllParticipating())
  for (const g of gs) { await c.sock.sendMessage(g, { text: `📣 *Anuncio*\n\n${c.text}` }); await new Promise(r => setTimeout(r, 1500)) }
  await c.reply(`Enviado a ${gs.length} grupos.`)
})
add(['grupos'], 'Owner', 'Lista de grupos', { owner: true }, async c => {
  const g = Object.values(await c.sock.groupFetchAllParticipating())
  await c.reply(g.map(x => `• ${x.subject} (${x.participants.length})`).join('\n') || 'Ninguno')
})
add(['salir', 'leave'], 'Owner', 'El bot sale del grupo', { owner: true, group: true }, async c => {
  await c.sock.groupLeave(c.chat)
})

// ───────── HANDLER ─────────
module.exports = async (sock, msg) => {
  const chat = msg.key.remoteJid
  const isGroup = chat.endsWith('@g.us')
  const fromMe = !!msg.key.fromMe

  const sender = fromMe
    ? sock.user.id
    : isGroup ? (msg.key.participant || msg.participant) : chat

  const body = getBody(msg).trim()
  const ctx = getCtx(msg)

  const alt = msg.key.participantAlt || msg.key.remoteJidAlt
  const isOwner = fromMe || config.owners.includes(num(sender)) || (alt && config.owners.includes(num(alt)))
  const meta = isGroup ? await sock.groupMetadata(chat).catch(() => null) : null

  if (isGroup && meta && db.group(chat).antilink && !fromMe && /chat\.whatsapp\.com\/\w+/i.test(body)) {
    const me = meta.participants.find(p => sameUser(p, sock.user.id))
    const adm = meta.participants.find(p => sameUser(p, sender))?.admin
    if (me?.admin && !adm && !isOwner) {
      await sock.sendMessage(chat, { delete: msg.key })
      await sock.groupParticipantsUpdate(chat, [sender], 'remove')
      return
    }
  }

  const prefix = config.prefixes.find(p => body.startsWith(p))
  if (!prefix) return
  const [name, ...args] = body.slice(prefix.length).trim().split(/\s+/)
  const cmd = commands[name?.toLowerCase()]
  if (!cmd) return
  if (db.data.mode === 'self' && !isOwner) return

  const reply = (text, mentions = []) => sock.sendMessage(chat, { text, mentions }, { quoted: msg })
  const isAdmin = !!meta?.participants.find(p => sameUser(p, sender))?.admin
  const isBotAdmin = !!meta?.participants.find(p => sameUser(p, sock.user.id))?.admin

  if (cmd.owner && !isOwner) return reply('❌ Solo el dueño.')
  if (cmd.group && !isGroup) return reply('❌ Solo en grupos.')
  if (cmd.admin && !isAdmin && !isOwner) return reply('❌ Solo admins.')
  if (cmd.botAdmin && !isBotAdmin) return reply('❌ Necesito ser admin.')

  const target = ctx.mentionedJid?.[0] || ctx.participant ||
    (args[0] && /^\d{8,}$/.test(args[0].replace(/\D/g, '')) ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null)
  const quotedMsg = ctx.quotedMessage
    ? { key: { remoteJid: chat, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage }
    : null

  await cmd.run({ sock, msg, chat, sender, args, text: args.join(' '), meta, ctx, target, quotedMsg, reply, isOwner })
}
