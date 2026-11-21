const H = require('./wacore')
require('./cmds_a')(H)
require('./cmds_b')(H)
require('./cmds_c')(H)
require('./cmds_d')(H)
require('./cmds_f')(H)
require('./cmds_g')(H)
require('./cmds_h')(H)
require('./cmds_i')(H)
require('./reacciones')(H)
require('./cmds_j')(H)
const { commands, num, dbOf, saveDb, grp, getMeta, isAdmin, botAdmin, getBody, getCtx } = H
const NL = require('./natural')

const PREFIXES = ['.', ',']
const last = new Map()
const aiReplies = new Set()
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

async function handle(sock, m, phone) {
  const chat = m.key.remoteJid
  if (!chat || /@(newsletter|broadcast)$/.test(chat)) return
  if (m.key.fromMe && aiReplies.has(m.key.id)) { aiReplies.delete(m.key.id); return }
  const isGroup = chat.endsWith('@g.us')
  const fromMe = !!m.key.fromMe
  const sender = fromMe ? (sock.user && sock.user.id) : (isGroup ? (m.key.participant || m.participant) : chat)
  const body = getBody(m).trim()
  const db = dbOf(phone)
  const ctx = getCtx(m)
  const g = isGroup ? grp(phone, chat) : null

  // En grupos, los demás solo pueden usar el bot si está encendido (,bot on)
  if (isGroup && !fromMe && !g.on) return
  if (db.mode === 'self' && !fromMe) return

  if (isGroup && !fromMe && g.antilink && /chat\.whatsapp\.com\/\w+/i.test(body)) {
    const meta = await getMeta(sock, chat, phone)
    if (meta && botAdmin(sock, meta) && !isAdmin(meta, sender)) {
      await sock.sendMessage(chat, { delete: m.key }).catch(() => {})
      await sock.groupParticipantsUpdate(chat, [sender], 'remove').catch(() => {})
      return
    }
  }

  const reply = (text, mentions = []) => sock.sendMessage(chat, { text, mentions }, { quoted: m })
  const prefix = PREFIXES.find(p => body.startsWith(p))
  let name = '', args = [], cmd = null, natural = false, targetName = ''
  const who = fromMe ? 'yo:' + phone : sender
  const conversationKey = phone + ':' + chat + ':' + who
  const memoryForUser = () => Array.isArray(db.aiMemory && db.aiMemory[who]) ? db.aiMemory[who] : []

  if (prefix) {
    const [n0, ...rest] = body.slice(prefix.length).trim().split(/\s+/)
    name = (n0 || '').toLowerCase()
    args = rest
    cmd = commands[name]
    if (!cmd) return
  } else {
    // La charla libre solo se activa al nombrar a Yuta; no responde a cada mensaje del grupo.
    if (!/(^|[^a-z0-9])yuta([^a-z0-9]|$)/i.test(body)) return
    natural = true
    const key = who + ':ai'
    if (Date.now() - (last.get(key) || 0) < 5000) return
    last.set(key, Date.now())
    if (last.size > 500) last.delete(last.keys().next().value)

    const clean = body.replace(/(^|[^a-z0-9])yuta([^a-z0-9]|$)/ig, ' ').replace(/[,:;.!?]+/g, ' ').trim()
    const mems = memoryForUser()
    const saveMemory = text => {
      const value = text.trim().slice(0, 180)
      if (!value || /password|contraseñ|token|cookie|clave api|api key|código de vinculaci/i.test(value)) return false
      db.aiMemory ||= {}; db.aiMemory[who] ||= []
      if (!db.aiMemory[who].includes(value)) db.aiMemory[who] = [...db.aiMemory[who], value].slice(-15)
      saveDb(phone); return true
    }
    const remember = clean.match(/^(?:por favor )?(?:recuerda|acordate|acuérdate|guarda|anota)\s+(?:que\s+)?(.+)$/i)
    const forget = clean.match(/^(?:por favor )?(?:olvida|olvidate|borra|elimina)\s+(?:que\s+)?(.+)$/i)
    if (remember) {
      if (saveMemory(remember[1])) await reply('🧠 Dale, lo voy a recordar para vos.')
      else await reply('No guardo contraseñas, tokens ni códigos. Podés decirme otro dato o preferencia para recordar.')
      return
    }
    if (forget) {
      const needle = norm(forget[1]); const before = mems.length
      db.aiMemory ||= {}; db.aiMemory[who] = mems.filter(x => !norm(x).includes(needle) && !needle.includes(norm(x)))
      saveDb(phone)
      await reply(before === db.aiMemory[who].length ? 'No encontré ese recuerdo.' : '🧹 Listo, borré ese recuerdo.')
      return
    }
    if (/^(?:que recuerdas|que te acuerdas|mis recuerdos|que sabes de mi|que sabes sobre mi)$/i.test(norm(clean))) {
      await reply(mems.length ? '🧠 *Lo que recuerdo de vos*\n' + mems.map(x => '• ' + x).join('\n') + '\n\nPodés decir “Yuta, olvida …” para borrar algo.' : 'Todavía no guardé recuerdos tuyos. Decime “Yuta, recuerda que …” si querés que guarde una preferencia.')
      return
    }

    await sock.sendMessage(chat, { react: { text: '🤔', key: m.key } }).catch(() => {})
    let plan
    try {
      const commandList = [...new Set(Object.values(commands))].map(x => ({ name: x.names[0], aliases: x.names.slice(1), cat: x.cat, desc: x.desc, usage: x.usage || '', group: !!x.group, admin: !!x.admin, owner: !!x.owner, botAdmin: !!x.botAdmin }))
      plan = await NL.interpret(clean || body, commandList, mems, conversationKey)
    }
    catch (e) { console.log('YUTA AI ERROR:', e.message); await reply('Ahora no pude entenderte; probá de nuevo en un momento.'); return }

    if (plan.type === 'chat') {
      try {
        const text = await NL.replyChat(clean || body, mems, conversationKey)
        const sent = await reply(text)
        if (sent && sent.key && sent.key.id) { aiReplies.add(sent.key.id); if (aiReplies.size > 300) aiReplies.delete(aiReplies.values().next().value) }
        NL.rememberTurn(conversationKey, clean || body, text)
      } catch (e) { console.log('YUTA CHAT ERROR:', e.message); await reply('Se me trabó la respuesta, perdón. Intentá otra vez en un ratito.') }
      return
    }
    if (plan.type === 'clarify') { await reply(plan.text); return }
    if (plan.type === 'search') {
      try {
        const text = await NL.searchWeb(plan.query)
        const sent = await reply(text)
        if (sent && sent.key && sent.key.id) { aiReplies.add(sent.key.id); if (aiReplies.size > 300) aiReplies.delete(aiReplies.values().next().value) }
        NL.rememberTurn(conversationKey, clean || body, text)
      } catch (e) { console.log('YUTA SEARCH ERROR:', e.message); await reply('No pude buscar eso ahora. Probá de nuevo en un rato.') }
      return
    }
    if (plan.type !== 'command') return
    name = plan.name
    args = plan.args
    targetName = plan.targetName
    cmd = commands[name]
    if (!cmd) { await reply('No encontré esa función.'); return }
  }

  const rateKey = who + (cmd.heavy ? ':h' : ':n')
  if (Date.now() - (last.get(rateKey) || 0) < (cmd.heavy ? 8000 : 2500)) return
  last.set(rateKey, Date.now())
  if (last.size > 500) last.delete(last.keys().next().value)
  console.log('💬', phone, natural ? 'nl→' + name : name, args.join(' ').slice(0, 40))

  if (cmd.owner && !fromMe) return reply('Solo el dueño del bot (la cuenta vinculada) puede usar este comando.')
  if (cmd.group && !isGroup) return reply('Este comando solo funciona en grupos.')
  let meta = null
  if (cmd.group && !cmd.nometa) {
    meta = await getMeta(sock, chat, phone)
    if (!meta) return reply('No pude leer los datos del grupo. Intenta de nuevo.')
    if (cmd.admin && !fromMe && !isAdmin(meta, sender)) return reply('Solo los administradores pueden usar este comando.')
    if (cmd.botAdmin && !botAdmin(sock, meta)) return reply('Necesito ser administrador del grupo para hacer eso.')
  }

  let target = (ctx.mentionedJid && ctx.mentionedJid[0]) || (ctx.quotedMessage && ctx.participant) ||
    (args[0] && /^\d{8,}$/.test(args[0].replace(/\D/g, '')) ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null)
  if (!target && natural && targetName && meta && ['kick', 'echar', 'promote', 'daradmin', 'demote', 'quitaradmin'].includes(name)) {
    const wanted = norm(targetName)
    const matches = meta.participants.filter(p => [p.name, p.notify, p.verifiedName, p.subject, num(p.id)].some(v => norm(v) === wanted))
    if (matches.length === 1) target = matches[0].id || matches[0].jid
    else if (matches.length !== 1) return reply(matches.length ? 'Hay más de una persona con ese nombre; respondé a su mensaje o mencionála.' : 'No pude identificar a quién te referís. Respondé a su mensaje o mencionála.')
  }
  const quoted = ctx.quotedMessage ? { key: { remoteJid: chat, id: ctx.stanzaId, participant: ctx.participant }, message: ctx.quotedMessage } : null

  try {
    await cmd.run({ sock, m, chat, sender, args, text: args.join(' '), prefix: prefix || '.', meta, ctx, target, targetName, quoted, reply, phone, db, isGroup, fromMe })
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

module.exports = { handle, attach, setLinker: H.setLinker, list: H.list, setPrefs: H.setPrefs, forget: H.forget, cleanName: H.cleanName }
