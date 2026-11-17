const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile, spawnSync } = require('child_process')
const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys')
const play = require('./play')
const fast = require('./fast')

const PREFIXES = ['.', ',']
const SITE = process.env.PUBLIC_URL || 'https://yuta-bot-x9pg.onrender.com'
const NAME = 'YUTA PLAY'
const FORMAT = (process.env.AUDIO_FORMAT || 'mp3').toLowerCase()
const MAX_MIN = 12
const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?v=)([\w-]{11})/i
const started = Date.now()

const num = j => String(j || '').split('@')[0].split(':')[0]
const pick = a => a[Math.floor(Math.random() * a.length)]
const rnd = () => Math.floor(Math.random() * 101)
const durSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)
const uptime = () => { const s = Math.floor((Date.now() - started) / 1000); return Math.floor(s / 3600) + 'h ' + (Math.floor(s / 60) % 60) + 'm ' + (s % 60) + 's' }
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const unwrap = m => { const c = m.message; return (c && c.ephemeralMessage && c.ephemeralMessage.message) || (c && c.viewOnceMessage && c.viewOnceMessage.message) || c }
const getBody = m => { const c = unwrap(m); return (c && (c.conversation || (c.extendedTextMessage && c.extendedTextMessage.text) || (c.imageMessage && c.imageMessage.caption) || (c.videoMessage && c.videoMessage.caption))) || '' }
const getCtx = m => { const c = unwrap(m); const x = c && Object.values(c).find(v => v && typeof v === 'object' && v.contextInfo); return (x && x.contextInfo) || {} }

// ───── ffmpeg ─────
let FF
function ffbin() {
  if (FF !== undefined) return FF
  FF = null
  try { if (spawnSync('ffmpeg', ['-version']).status === 0) FF = 'ffmpeg' } catch {}
  if (!FF) { try { FF = require('ffmpeg-static') } catch {} }
  console.log('🎞️ ffmpeg:', FF || 'no disponible')
  return FF
}
const tmp = ext => path.join(os.tmpdir(), 'yw_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext)
const rm = (...f) => f.forEach(x => fs.unlink(x, () => {}))
function ff(args, ms = 90000) {
  return new Promise((res, rej) => {
    const bin = ffbin()
    if (!bin) return rej(new Error('ffmpeg no disponible'))
    execFile(bin, ['-y', '-v', 'error', ...args], { timeout: ms, maxBuffer: 1024 * 1024 * 8 }, (e, so, se) =>
      e ? rej(new Error(String(se || e.message).split('\n').filter(Boolean).slice(-1)[0] || 'ffmpeg falló')) : res())
  })
}
async function convert(buf, inExt, outExt, args) {
  const inp = tmp(inExt), out = tmp(outExt)
  fs.writeFileSync(inp, buf)
  try { await ff(['-i', inp, ...args, out]); return fs.readFileSync(out) } finally { rm(inp, out) }
}
const toMp3 = buf => convert(buf, 'm4a', 'mp3', ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-compression_level', '9'])
const toOpus = buf => convert(buf, 'mp3', 'ogg', ['-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg'])
const gifToMp4 = buf => convert(buf, 'gif', 'mp4', ['-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an'])

async function toWebp(buf, isVideo, ext) {
  const base = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0'
  const mk = (q, fps) => ['-vf', isVideo ? base + ',fps=' + fps : base, ...(isVideo ? ['-t', '8'] : []), '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(q), '-compression_level', '4', '-loop', '0', '-an']
  let out = await convert(buf, ext, 'webp', mk(50, 12))
  if (isVideo && out.length > 950 * 1024) out = await convert(buf, ext, 'webp', mk(30, 10))
  return out
}
async function addExif(webp, pack, author) {
  try {
    const wp = require('node-webpmux')
    const img = new wp.Image()
    await img.load(webp)
    const json = { 'sticker-pack-id': 'yuta-' + Date.now(), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['✨'] }
    const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jb = Buffer.from(JSON.stringify(json), 'utf8')
    const exif = Buffer.concat([head, jb])
    exif.writeUIntLE(jb.length, 14, 4)
    img.exif = exif
    return await img.save(null)
  } catch (e) { console.log('⚠ sticker sin metadatos:', e.message); return webp }
}

// ───── TTS (voz de Google) ─────
const LANGS = new Set(['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko', 'ru', 'ar', 'hi', 'id', 'tr', 'nl', 'pl', 'ca'])
function splitText(t, max = 180) {
  const out = []
  let cur = ''
  for (const w of t.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w.slice(0, max) } else cur = (cur + ' ' + w).trim()
  }
  if (cur) out.push(cur)
  return out
}
async function googleTTS(text, lang) {
  const parts = splitText(text)
  const bufs = []
  for (let i = 0; i < parts.length; i++) {
    const u = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + lang + '&q=' + encodeURIComponent(parts[i]) + '&total=' + parts.length + '&idx=' + i + '&textlen=' + parts[i].length
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10) Chrome/120 Mobile Safari/537.36', Referer: 'https://translate.google.com/' }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) throw new Error('Google respondió ' + r.status)
    bufs.push(Buffer.from(await r.arrayBuffer()))
  }
  return Buffer.concat(bufs)
}

// ───── datos por cuenta ─────
const dbs = new Map()
const dbFile = phone => path.join(__dirname, 'sessions', phone, 'bot.json')
function dbOf(phone) {
  if (!dbs.has(phone)) {
    let d = { mode: 'public', groups: {} }
    try { d = { ...d, ...JSON.parse(fs.readFileSync(dbFile(phone), 'utf8')) } } catch {}
    dbs.set(phone, d)
  }
  return dbs.get(phone)
}
const saveDb = phone => { try { fs.writeFileSync(dbFile(phone), JSON.stringify(dbs.get(phone))) } catch {} }
const grp = (phone, id) => (dbOf(phone).groups[id] ??= { welcome: false, antilink: false })

// ───── grupos ─────
const metaCache = new Map()
async function getMeta(sock, chat, phone) {
  const key = phone + chat
  const hit = metaCache.get(key)
  if (hit && Date.now() - hit.t < 60000) return hit.m
  try {
    const m = await Promise.race([sock.groupMetadata(chat), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))])
    metaCache.set(key, { t: Date.now(), m })
    if (metaCache.size > 100) metaCache.delete(metaCache.keys().next().value)
    return m
  } catch { return hit ? hit.m : null }
}
const idsOf = p => [p.id, p.jid, p.phoneNumber, p.lid].filter(Boolean)
const isAdmin = (meta, jid) => !!(meta && jid && meta.participants.some(p => p.admin && idsOf(p).some(x => num(x) === num(jid))))
const botAdmin = (sock, meta) => [sock.user && sock.user.id, sock.user && sock.user.lid].filter(Boolean).some(j => isAdmin(meta, j))

// ───── registro de comandos ─────
const commands = {}
const add = (names, cat, desc, opts, run) => {
  if (typeof opts === 'function') { run = opts; opts = {} }
  const c = { names, cat, desc, ...opts, run }
  names.forEach(n => (commands[n] = c))
}
const list = () => [...new Set(Object.values(commands))].map(c => ({ name: c.names[0], aliases: c.names.slice(1), cat: c.cat, desc: c.desc, usage: c.usage || '', react: !!c.react }))

const ORDER = ['General', 'Música', 'Grupo', 'Anime', 'Juegos', 'Herramientas', 'Owner']

add(['menu', 'help', 'ayuda', 'comandos'], 'General', 'Muestra esta lista', { usage: '[sección]' }, async c => {
  const cats = {}
  for (const x of new Set(Object.values(commands))) (cats[x.cat] ??= []).push(x)
  const keys = ORDER.filter(k => cats[k])
  const p = c.prefix
  const section = k => {
    let t = '╭─── *' + k.toUpperCase() + '*\n│\n'
    const rs = cats[k].filter(x => x.react)
    for (const x of cats[k]) {
      if (x.react) continue
      t += '│ `' + p + x.names[0] + '`' + (x.usage ? ' _' + x.usage + '_' : '') + '\n│ ' + x.desc + '\n│\n'
    }
    if (rs.length) t += '│ *Reacciones en GIF*\n│ ' + rs.map(x => '`' + p + x.names[0] + '`').join(' ') + '\n│ Menciona o responde a alguien. Ej: _' + p + 'hug @usuario_\n│\n'
    return t + '╰──────────────'
  }
  const f = norm(c.args[0])
  if (f) {
    const k = keys.find(x => norm(x) === f)
    if (!k) return c.reply('No existe esa sección.\n*Disponibles:* ' + keys.join(', '))
    return c.reply(section(k))
  }
  const total = new Set(Object.values(commands)).size
  await c.reply(
    '*' + NAME + '*\n_Bot de WhatsApp_\n\n' +
    '*Comandos:* ' + total + '\n*Prefijos:* `.` `,`\n*Activo:* ' + uptime() + '\n\n' +
    keys.map(section).join('\n\n') + '\n\n_' + SITE + '_'
  )
})
add(['ping', 'speed'], 'General', 'Comprueba que el bot responde', async c => {
  const t = Date.now()
  await c.reply('🏓 Pong!')
  await c.reply('⚡ ' + (Date.now() - t) + ' ms')
})
add(['runtime', 'uptime'], 'General', 'Tiempo que lleva encendido', async c => c.reply('⏱️ ' + uptime()))
add(['info', 'botinfo'], 'General', 'Datos técnicos del bot', async c => {
  const mem = process.memoryUsage().rss / 1048576
  await c.reply('🤖 *' + NAME + '*\n⏱️ Activo: ' + uptime() + '\n💾 Memoria: ' + mem.toFixed(0) + ' MB\n🟢 Node ' + process.version + '\n🌐 ' + SITE)
})

// ───── música ─────
let chain = Promise.resolve(), pending = 0
const enqueue = fn => { pending++; const p = chain.then(fn); chain = p.catch(() => {}).then(() => { pending-- }); return p }

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
  if (pending >= 3) return c.reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
  if (pending > 0) await c.reply('⏳ Estás en cola, ya empiezo.')
  await c.sock.sendMessage(c.chat, { react: { text: '🔎', key: c.m.key } }).catch(() => {})
  try {
    await enqueue(async () => {
      const t0 = Date.now()
      const item = await findSong(q)
      if (!item) return c.reply('❌ No encontré esa canción. Prueba con otro nombre.')
      if (durSec(item.dur) > MAX_MIN * 60) return c.reply('❌ Esa canción es muy larga (máx ' + MAX_MIN + ' min).')
      const t1 = Date.now()
      const cap = '╭─〔 🎧 *' + NAME + '* 〕\n│ 🎵 *' + (item.title || 'Audio de YouTube') + '*\n│ 👤 ' + (item.by || '-') + (item.dur ? '\n│ ⏱️ ' + item.dur : '') + '\n╰──────────────\n⏳ _Descargando el audio..._'
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

// ───── grupo ─────
const G = { group: true }
const GA = { group: true, admin: true }
const GB = { group: true, admin: true, botAdmin: true }

add(['tagall', 'todos'], 'Grupo', 'Menciona a todos los miembros', { ...GA, usage: '[mensaje]' }, async c => {
  const ids = c.meta.participants.map(p => p.id)
  await c.reply('📢 *' + (c.text || 'Atención') + '*\n\n' + ids.map(i => '› @' + num(i)).join('\n'), ids)
})
add(['hidetag', 'notify'], 'Grupo', 'Avisa a todos sin mostrar la lista', { ...GA, usage: '<texto>' }, async c => {
  await c.sock.sendMessage(c.chat, { text: c.text || '📢', mentions: c.meta.participants.map(p => p.id) })
})
add(['kick', 'echar'], 'Grupo', 'Expulsa a un miembro', { ...GB, usage: '@usuario' }, async c => {
  if (!c.target) return c.reply('Menciona o responde a alguien.')
  await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'remove')
})
add(['add', 'agregar'], 'Grupo', 'Agrega un número al grupo', { ...GB, usage: '<número>' }, async c => {
  const n = (c.args[0] || '').replace(/\D/g, '')
  if (!n) return c.reply('Uso: `' + c.prefix + 'add` _5493510000000_')
  await c.sock.groupParticipantsUpdate(c.chat, [n + '@s.whatsapp.net'], 'add')
})
add(['promote', 'daradmin'], 'Grupo', 'Da rol de administrador', { ...GB, usage: '@usuario' }, async c => {
  if (!c.target) return c.reply('Menciona o responde a alguien.')
  await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'promote')
  await c.reply('✅ Ahora es administrador.')
})
add(['demote', 'quitaradmin'], 'Grupo', 'Quita el rol de administrador', { ...GB, usage: '@usuario' }, async c => {
  if (!c.target) return c.reply('Menciona o responde a alguien.')
  await c.sock.groupParticipantsUpdate(c.chat, [c.target], 'demote')
  await c.reply('✅ Ya no es administrador.')
})
add(['link', 'enlace'], 'Grupo', 'Enlace de invitación del grupo', { ...G, botAdmin: true }, async c => {
  await c.reply('🔗 https://chat.whatsapp.com/' + (await c.sock.groupInviteCode(c.chat)))
})
add(['revoke', 'resetlink'], 'Grupo', 'Genera un enlace nuevo e invalida el anterior', GB, async c => {
  await c.sock.groupRevokeInvite(c.chat)
  await c.reply('✅ Enlace restablecido.')
})
add(['grupo', 'group'], 'Grupo', 'Abre o cierra el chat para los miembros', { ...GB, usage: 'abrir|cerrar' }, async c => {
  const o = c.args[0]
  if (!['abrir', 'cerrar'].includes(o)) return c.reply('Uso: `' + c.prefix + 'grupo` _abrir_ o _cerrar_')
  await c.sock.groupSettingUpdate(c.chat, o === 'abrir' ? 'not_announcement' : 'announcement')
  await c.reply(o === 'abrir' ? '🔓 Grupo abierto.' : '🔒 Grupo cerrado.')
})
add(['setname'], 'Grupo', 'Cambia el nombre del grupo', { ...GB, usage: '<nombre>' }, async c => {
  if (!c.text) return c.reply('Escribe el nuevo nombre.')
  await c.sock.groupUpdateSubject(c.chat, c.text)
})
add(['setdesc'], 'Grupo', 'Cambia la descripción del grupo', { ...GB, usage: '<texto>' }, async c => {
  await c.sock.groupUpdateDescription(c.chat, c.text)
})
add(['admins'], 'Grupo', 'Lista de administradores', G, async c => {
  const a = c.meta.participants.filter(p => p.admin).map(p => p.id)
  await c.reply('👮 *Administradores*\n' + a.map(i => '› @' + num(i)).join('\n'), a)
})
add(['infogrupo', 'groupinfo'], 'Grupo', 'Datos del grupo', G, async c => {
  const m = c.meta
  await c.reply('👥 *' + m.subject + '*\n\n› Miembros: ' + m.participants.length + '\n› Admins: ' + m.participants.filter(p => p.admin).length + '\n› ID: ' + m.id + '\n\n' + (m.desc || 'Sin descripción'))
})
add(['del', 'delete'], 'Grupo', 'Borra un mensaje (responde a él)', GB, async c => {
  const x = c.ctx
  if (!x.stanzaId) return c.reply('Responde al mensaje que quieres borrar.')
  await c.sock.sendMessage(c.chat, { delete: { remoteJid: c.chat, fromMe: false, id: x.stanzaId, participant: x.participant } })
})
add(['welcome', 'bienvenida'], 'Grupo', 'Activa o desactiva la bienvenida', { ...GA, usage: 'on|off' }, async c => {
  const v = c.args[0]
  if (!['on', 'off'].includes(v)) return c.reply('Uso: `' + c.prefix + 'welcome` _on_ o _off_')
  grp(c.phone, c.chat).welcome = v === 'on'; saveDb(c.phone)
  await c.reply('Bienvenida: ' + v)
})
add(['antilink'], 'Grupo', 'Borra enlaces de grupos y expulsa a quien los envíe', { ...GB, usage: 'on|off' }, async c => {
  const v = c.args[0]
  if (!['on', 'off'].includes(v)) return c.reply('Uso: `' + c.prefix + 'antilink` _on_ o _off_')
  grp(c.phone, c.chat).antilink = v === 'on'; saveDb(c.phone)
  await c.reply('Antilink: ' + v)
})

// ───── anime ─────
async function nekos(cat) {
  const r = await fetch('https://nekos.best/api/v2/' + cat, { signal: AbortSignal.timeout(12000) })
  return (await r.json()).results[0].url
}
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
  const out = await addExif(await toWebp(buf, isVideo, ext), pk || NAME, au || 'Yuta')
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
add(['modo', 'mode'], 'Owner', 'Público: responde a todos. Privado: solo a ti', { ...OW, usage: 'public|self' }, async c => {
  if (!['public', 'self'].includes(c.args[0])) return c.reply('Uso: `' + c.prefix + 'modo` _public_ o _self_')
  dbOf(c.phone).mode = c.args[0]; saveDb(c.phone)
  await c.reply('Modo: ' + (c.args[0] === 'self' ? 'privado' : 'público'))
})
add(['grupos'], 'Owner', 'Lista los grupos donde está el bot', OW, async c => {
  const g = Object.values(await c.sock.groupFetchAllParticipating())
  await c.reply(g.map(x => '› ' + x.subject + ' (' + x.participants.length + ')').join('\n') || 'Ninguno')
})
add(['salir', 'leave'], 'Owner', 'El bot sale del grupo actual', { ...OW, group: true }, async c => {
  await c.sock.groupLeave(c.chat)
})

// ───── manejador ─────
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

  if (isGroup && !fromMe && grp(phone, chat).antilink && /chat\.whatsapp\.com\/\w+/i.test(body)) {
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
  if (cmd.group) {
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
    if (!grp(phone, id).welcome) return
    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.id
      const tag = '@' + num(jid)
      if (action === 'add') await sock.sendMessage(id, { text: '👋 Bienvenido ' + tag + ' al grupo.', mentions: [jid] }).catch(() => {})
      if (action === 'remove') await sock.sendMessage(id, { text: '👋 ' + tag + ' salió del grupo.', mentions: [jid] }).catch(() => {})
    }
  })
}

module.exports = { handle, attach, list }
