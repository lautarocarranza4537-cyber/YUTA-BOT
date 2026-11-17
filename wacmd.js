const H = require('./wacore')
require('./cmds_a')(H)
require('./cmds_b')(H)
require('./cmds_c')(H)
require('./cmds_d')(H)
const { commands, num, dbOf, saveDb, grp, getMeta, isAdmin, botAdmin, getBody, getCtx } = H

const PREFIXES = ['.', ',']
const last = new Map()

async function handle(sock, m, phone) {
  const chat = m.key.remoteJid
  if (!chat || /@(newsletter|broadcast)$/.test(chat)) return
  const isGroup = chat.endsWith('@g.us')
  const fromMe = !!m.key.fromMe
  const sender = fromMe ? (sock.user && sock.user.id) : (isGroup ? (m.key.participant || m.participant) : chat)
  const body = getBody(m).trim()
  const db = dbOf(phone)
  const ctx = getCtx(m)
  const g = isGroup ? grp(phone, chat) : null

  // En grupos, los demás solo pueden usar el bot si está encendido (,bot on)
  if (isGroup && !fromMe && !g.on) return

  if (isGroup && !fromMe && g.antilink && /chat\.whatsapp\.com\/\w+/i.test(body)) {
    const meta = await getMeta(sock, chat, phone)
    if (meta && botAdmin(sock, meta) && !isAdmin(meta, sender)) {
      await sock.sendMessage(chat, { delete: m.key }).catch(() => {})
      await sock.groupParticipantsUpdate(chat, [sender], 'remove').catch(() => {})
      return
    }
  }

  const prefix = PREFIXES.find(p => body.startsWith(p))
  if (!prefix) return
  const [n0, ...args] = body.slice(prefix.length).trim().split(/\s+/)
  const name = (n0 || '').toLowerCase()
  const cmd = commands[name]
  if (!cmd) return
  if (db.mode === 'self' && !fromMe) return

  const who = fromMe ? 'yo:' + phone : sender
  const key = who + (cmd.heavy ? ':h' : ':n')
  if (Date.now() - (last.get(key) || 0) < (cmd.heavy ? 8000 : 2500)) return
  last.set(key, Date.now())
  if (last.size > 500) last.delete(last.keys().next().value)

  const reply = (text, mentions = []) => sock.sendMessage(chat, { text, mentions }, { quoted: m })
  console.log('💬', phone, name, args.join(' ').slice(0, 40))

  if (cmd.owner && !fromMe) return reply('Solo el dueño del bot (la cuenta vinculada) puede usar este comando.')
  if (cmd.group && !isGroup) return reply('Este comando solo funciona en grupos.')
  let meta = null
  if (cmd.group && !cmd.nometa) {
    meta = await getMeta(sock, chat, phone)
    if (!meta) return reply('No pude leer los datos del grupo. Intenta de nuevo.')
    if (cmd.admin && !fromMe && !isAdmin(meta, sender)) return reply('Solo los administradores pueden usar este comando.')
    if (cmd.botAdmin && !botAdmin(sock, meta)) return reply('Necesito ser administrador del grupo para hacer eso.')
  }

  const target = (ctx.mentionedJid && ctx.mentionedJid[0]) || (ctx.quotedMessage && ctx.participant) ||
    (args[0] && /^\d{8,}$/.test(args[0].replace(/\D/g, '')) ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null)
  const quoted = ctx.quotedMessage ? { key: { remoteJid: chat, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage } : null

  try {
    await cmd.run({ sock, m, chat, sender, args, text: args.join(' '), prefix, meta, ctx, target, quoted, reply, phone, db, isGroup, fromMe })
  } catch (e) {
    console.log('❌ error en', name, e.message)
    await reply('❌ ' + String(e.message || 'Algo salió mal').slice(0, 200)).catch(() => {})
  }
}

function attach(sock, phone) {
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    const g = grp(phone, id)
    if (!g.on || !g.welcome) return
    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.id
      const tag = '@' + num(jid)
      if (action === 'add') await sock.sendMessage(id, { text: '👋 Bienvenido ' + tag + ' al grupo.', mentions: [jid] }).catch(() => {})
      if (action === 'remove') await sock.sendMessage(id, { text: '👋 ' + tag + ' salió del grupo.', mentions: [jid] }).catch(() => {})
    }
  })
}

module.exports = { handle, attach, list: H.list, setPrefs: H.setPrefs, forget: H.forget, cleanName: H.cleanName }
