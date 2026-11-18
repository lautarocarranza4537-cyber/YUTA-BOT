const fs = require('fs')
const os = require('os')
const { jidNormalizedUser } = require('@whiskeysockets/baileys')

const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const KEY = process.env.ANTHROPIC_API_KEY || ''
const NEWS = [
  '• Convertir: qr, ocr, tomp3, todoc, tourl, hd y editar.',
  '• Buscar: clima, traducir, wiki, github, npm, acortar y ss.',
  '• IA: ia e imagina.',
  '• Economía: daily, weekly, work, crime, apuestas y más.',
  '• play2 baja videos de YouTube en 720p.',
  '• pin busca 10 imágenes de Pinterest.',
  '• code vincula tu WhatsApp desde el privado.'
]

async function claude(prompt, imgB64) {
  const content = []
  if (imgB64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgB64 } })
  content.push({ type: 'text', text: prompt })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 700,
      system: 'Eres un asistente de WhatsApp. Responde en español latino, claro y breve (máximo 8 líneas). Usa *negrita* de WhatsApp solo si ayuda.',
      messages: [{ role: 'user', content }]
    }),
    signal: AbortSignal.timeout(60000)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status)
  return (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n').trim()
}
async function freeText(prompt) {
  const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt + '\n\n(Responde en español latino, breve y claro.)'), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) })
  if (!r.ok) throw new Error('El servicio de IA gratis no respondió (' + r.status + ')')
  return (await r.text()).trim()
}

async function speed() {
  const t = []
  for (let i = 0; i < 3; i++) {
    const s = Date.now()
    try { await (await fetch('https://speed.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(5000) })).text(); t.push(Date.now() - s) } catch {}
  }
  const ping = t.length ? Math.min(...t) : null
  let down = null, up = null
  try {
    const s = Date.now()
    const r = await fetch('https://speed.cloudflare.com/__down?bytes=20000000', { signal: AbortSignal.timeout(30000) })
    let n = 0
    for await (const ch of r.body) n += ch.length
    down = (n * 8 / 1e6) / ((Date.now() - s) / 1000)
  } catch {}
  try {
    const body = Buffer.alloc(5 * 1024 * 1024, 1)
    const s = Date.now()
    const r = await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body, signal: AbortSignal.timeout(30000) })
    await r.text()
    up = (body.length * 8 / 1e6) / ((Date.now() - s) / 1000)
  } catch {}
  return { ping, down, up }
}

module.exports = H => {
  const { add, num, norm, uptime, convert, botName, bannerFile, nekos, ORDER, commands, SITE } = H
  const ownerJid = c => jidNormalizedUser(c.sock.user.id)

  // ───── menú nuevo: categorías (se abre con ,menu <categoría>) ─────
  add(['menu', 'help', 'ayuda', 'comandos'], 'General', 'Muestra las categorías de comandos', { usage: '[categoría]' }, async c => {
    const cats = {}
    for (const x of new Set(Object.values(commands))) (cats[x.cat] ??= []).push(x)
    const keys = ORDER.filter(k => cats[k]).concat(Object.keys(cats).filter(k => !ORDER.includes(k)))
    const p = c.prefix
    const name = botName(c.phone)
    const f = norm(c.args[0])
    if (f) {
      const k = keys.find(x => norm(x) === f)
      if (!k) return c.reply('No existe esa categoría.\n*Categorías:* ' + keys.join(', '))
      let t = '*' + name + '* · ' + k + '\n\n'
      for (const x of cats[k]) if (!x.react) t += '`' + p + x.names[0] + '`' + (x.usage ? ' _' + x.usage + '_' : '') + '\n' + x.desc + '\n\n'
      const rs = cats[k].filter(x => x.react)
      if (rs.length) t += '*Reacciones*\n' + rs.map(x => '`' + p + x.names[0] + '`').join(' ') + '\nMenciona a alguien. Ej: _' + p + 'hug @usuario_'
      return c.reply(t.trim())
    }
    const total = new Set(Object.values(commands)).size
    let t = '*' + name + '*\nHola @' + num(c.sender) + ' · ' + total + ' comandos\n\n'
    for (const k of keys) t += '› *' + k + '* _(' + cats[k].length + ')_\n'
    t += '\nPara ver una categoría:\n`' + p + 'menu <categoría>`\nEj: `' + p + 'menu ' + norm(keys[2] || 'musica') + '`'
    let image = null
    const bf = bannerFile(c.phone)
    if (fs.existsSync(bf)) { try { image = fs.readFileSync(bf) } catch {} }
    if (!image) { try { image = { url: await nekos('waifu') } } catch {} }
    if (image) await c.sock.sendMessage(c.chat, { image, caption: t, mentions: [c.sender] }, { quoted: c.m })
    else await c.reply(t, [c.sender])
  })

  // ───── general ─────
  add(['status', 'estado', 'infobotserver'], 'General', 'Estado del bot y del servidor', async c => {
    const m = process.memoryUsage()
    const load = os.loadavg()[0].toFixed(2)
    await c.reply('📊 *Estado de ' + botName(c.phone) + '*\n\n⏱️ Activo: ' + uptime() + '\n💾 Memoria del bot: ' + (m.rss / 1048576).toFixed(0) + ' MB\n🖥️ Memoria libre: ' + (os.freemem() / 1048576).toFixed(0) + ' MB\n⚙️ CPU: ' + os.cpus().length + ' núcleos · carga ' + load + '\n🟢 Node ' + process.version + '\n🧩 Comandos: ' + new Set(Object.values(commands)).size + '\n🌐 ' + SITE)
  })
  add(['speedtest', 'testvelocidad', 'velocidadvps'], 'General', 'Mide el internet del servidor: bajada, subida y ping', { heavy: true }, async c => {
    await c.reply('⏳ Midiendo, tarda unos segundos…')
    const r = await speed()
    const f = v => (v == null ? 'sin datos' : v.toFixed(1) + ' Mbps')
    await c.reply('🚀 *Velocidad del servidor*\n\n🏓 Ping: ' + (r.ping == null ? 'sin datos' : r.ping + ' ms') + '\n⬇️ Bajada: ' + f(r.down) + '\n⬆️ Subida: ' + f(r.up))
  })
  add(['novedades', 'news', 'cambios', 'nuevo'], 'General', 'Las novedades y cambios recientes del bot', async c => c.reply('🆕 *Novedades*\n\n' + NEWS.join('\n')))

  add(['suggest', 'report', 'sugerencia', 'addanime'], 'General', 'Envía una sugerencia o reporte al dueño', { usage: '<texto>', heavy: true }, async c => {
    const t = c.text.trim().slice(0, 800)
    if (!t) return c.reply('Uso: `' + c.prefix + 'suggest` _tu sugerencia o reporte_')
    await c.sock.sendMessage(ownerJid(c), { text: '📩 *Sugerencia*\nDe: +' + num(c.sender) + (c.isGroup ? '\nGrupo: ' + c.chat : '') + '\n\n' + t })
    await c.reply('✅ Se la mandé al dueño. Gracias.')
  })
  add(['invite', 'invitar'], 'General', 'Pide invitar al bot a un grupo', { usage: '<enlace del grupo>', heavy: true }, async c => {
    const m = /chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/.exec(c.text)
    if (!m) return c.reply('Uso: `' + c.prefix + 'invite` _https://chat.whatsapp.com/…_')
    await c.sock.sendMessage(ownerJid(c), { text: '📨 *Pedido de invitación*\nDe: +' + num(c.sender) + '\nhttps://chat.whatsapp.com/' + m[1] + '\n\nPara entrar usa: `' + c.prefix + 'join` enlace' })
    await c.reply('✅ Le avisé al dueño. Él decide si entra.')
  })
  add(['join', 'unirse'], 'Owner', 'El bot entra a un grupo por su enlace', { owner: true, usage: '<enlace>' }, async c => {
    const m = /chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/.exec(c.text)
    if (!m) return c.reply('Uso: `' + c.prefix + 'join` _https://chat.whatsapp.com/…_')
    await c.sock.groupAcceptInvite(m[1])
    await c.reply('✅ Listo, entré al grupo.')
  })
  add(['inspect', 'inspeccionar', 'infolink', 'infoenlace'], 'General', 'Info de un grupo de WhatsApp por su enlace, sin entrar', { usage: '<enlace>', heavy: true }, async c => {
    const m = /chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/.exec(c.text)
    if (!m) return c.reply('Uso: `' + c.prefix + 'inspect` _https://chat.whatsapp.com/…_')
    const i = await c.sock.groupGetInviteInfo(m[1])
    const fecha = i.creation ? new Date(i.creation * 1000).toLocaleDateString('es-AR') : '?'
    await c.reply('👥 *' + i.subject + '*\n\n› Miembros: ' + (i.size || '?') + '\n› Creado: ' + fecha + '\n› Creador: ' + (i.owner ? '+' + num(i.owner) : '?') + '\n› ID: ' + i.id + '\n\n' + (i.desc ? String(i.desc).slice(0, 400) : 'Sin descripción'))
  })

  // ───── inteligencia artificial ─────
  add(['ia', 'ai', 'chatgpt', 'gpt'], 'IA', 'Pregúntale lo que sea a la IA (responde a una foto para que la vea)', { usage: '<pregunta>', heavy: true }, async c => {
    const q = c.ctx && c.ctx.quotedMessage
    const qt = (q && (q.conversation || (q.extendedTextMessage && q.extendedTextMessage.text))) || ''
    const prompt = (c.text || qt).trim().slice(0, 1500)
    const photo = [c.quoted, c.m].map(x => { const cc = x && x.message; return cc && (cc.imageMessage ? x : null) }).find(Boolean)
    if (!prompt && !photo) return c.reply('Uso: `' + c.prefix + 'ia` _¿cuál es la capital de Francia?_')
    await c.sock.sendMessage(c.chat, { react: { text: '🤔', key: c.m.key } }).catch(() => {})
    let out
    if (KEY) {
      let b64 = null
      if (photo) {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys')
        const buf = await convert(await downloadMediaMessage(photo, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage }), 'jpg', 'jpg', ['-vf', 'scale=min(1024\\,iw):-2', '-q:v', '5'])
        b64 = buf.toString('base64')
      }
      out = await claude(prompt || 'Describe esta imagen.', b64)
    } else {
      if (photo) return c.reply('Para que la IA vea fotos hace falta una clave de Claude (variable ANTHROPIC_API_KEY en Render).')
      out = await freeText(prompt)
    }
    if (!out) throw new Error('La IA no devolvió respuesta')
    await c.reply(out.slice(0, 3000))
  })
  add(['imagina', 'dalle', 'crearimagen', 'imagenia'], 'IA', 'Crea una imagen con IA a partir de lo que escribas', { usage: '<lo que quieres ver>', heavy: true }, async c => {
    const p = c.text.trim().slice(0, 400)
    if (!p) return c.reply('Uso: `' + c.prefix + 'imagina` _un gato astronauta en la luna_')
    await c.sock.sendMessage(c.chat, { react: { text: '🎨', key: c.m.key } }).catch(() => {})
    const r = await fetch('https://image.pollinations.ai/prompt/' + encodeURIComponent(p) + '?width=768&height=768&nologo=true', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(100000) })
    if (!r.ok || !/image/i.test(r.headers.get('content-type') || '')) throw new Error('El generador de imágenes no respondió')
    await c.sock.sendMessage(c.chat, { image: Buffer.from(await r.arrayBuffer()), caption: '🎨 ' + p.slice(0, 120) }, { quoted: c.m })
  })

  // ───── alias útiles ─────
  const alias = (name, extra) => {
    const x = commands[name]
    if (!x) return
    for (const n of extra) if (!commands[n]) { x.names.push(n); commands[n] = x }
  }
  alias('infogrupo', ['gp'])
  alias('pfp', ['getpic', 'fotoperfil', 'foto'])
  alias('ping', ['latencia'])
}
