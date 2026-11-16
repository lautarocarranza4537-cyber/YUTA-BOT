const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile, spawnSync } = require('child_process')

const PREFIXES = ['.', ',']
const PORT = process.env.PORT || 3000
const BASE = () => 'http://127.0.0.1:' + PORT
const SITE = process.env.PUBLIC_URL || 'https://yuta-bot-x9pg.onrender.com'
const MAX_MIN = 12
const CAP = 25 * 1024 * 1024
const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?v=)([\w-]{11})/i
const started = Date.now()

const getBody = m => {
  let c = m.message
  c = (c && c.ephemeralMessage && c.ephemeralMessage.message) || (c && c.viewOnceMessage && c.viewOnceMessage.message) || c
  return (c && (c.conversation || (c.extendedTextMessage && c.extendedTextMessage.text) || (c.imageMessage && c.imageMessage.caption) || (c.videoMessage && c.videoMessage.caption))) || ''
}
const durSec = t => String(t || '').split(':').reduce((a, b) => a * 60 + (+b || 0), 0)

let FF
const ffbin = () => {
  if (FF !== undefined) return FF
  FF = null
  try { if (spawnSync('ffmpeg', ['-version']).status === 0) FF = 'ffmpeg' } catch {}
  if (!FF) { try { FF = require('ffmpeg-static') } catch {} }
  console.log('🎞️ ffmpeg:', FF || 'no disponible')
  return FF
}
function toMp3(buf) {
  return new Promise((resolve, reject) => {
    const bin = ffbin()
    if (!bin) return reject(new Error('sin ffmpeg'))
    const id = path.join(os.tmpdir(), 'yw_' + Date.now() + '_' + Math.random().toString(36).slice(2))
    const inp = id + '.m4a', out = id + '.mp3'
    fs.writeFileSync(inp, buf)
    execFile(bin, ['-y', '-v', 'error', '-i', inp, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', out], { timeout: 90000 }, e => {
      let r = null
      try { if (!e) r = fs.readFileSync(out) } catch {}
      fs.unlink(inp, () => {}); fs.unlink(out, () => {})
      r ? resolve(r) : reject(e || new Error('conversión falló'))
    })
  })
}

let chain = Promise.resolve(), pending = 0
const enqueue = fn => {
  pending++
  const p = chain.then(fn)
  chain = p.catch(() => {}).then(() => { pending-- })
  return p
}

async function findSong(q) {
  const m = q.match(YT)
  if (m) {
    const id = m[1]
    try {
      const r = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent('https://youtu.be/' + id) + '&format=json', { signal: AbortSignal.timeout(8000) })
      const j = await r.json()
      return { id, title: j.title, by: j.author_name, img: j.thumbnail_url }
    } catch {
      return { id, title: '', by: '-', img: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' }
    }
  }
  const r = await fetch(BASE() + '/api/find?q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(45000) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Error del buscador')
  return (j.results || []).find(x => durSec(x.dur) <= MAX_MIN * 60) || null
}

async function getAudio(item) {
  const qs = (item.u ? 'u=' + encodeURIComponent(item.u) : 'id=' + encodeURIComponent(item.id)) + (item.title ? '&t=' + encodeURIComponent(item.title) : '')
  const r = await fetch(BASE() + '/api/stream?' + qs, { signal: AbortSignal.timeout(280000) })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.error || 'HTTP ' + r.status)
  }
  const chunks = []
  let n = 0
  for await (const c of r.body) {
    n += c.length
    if (n > CAP) throw new Error('El archivo es muy pesado')
    chunks.push(c)
  }
  return { buf: Buffer.concat(chunks), ct: r.headers.get('content-type') || '' }
}

const last = new Map()

async function handle(sock, m, phone) {
  const chat = m.key.remoteJid
  if (!chat || chat.endsWith('@newsletter') || chat.endsWith('@broadcast')) return
  const body = getBody(m).trim()
  const prefix = PREFIXES.find(p => body.startsWith(p))
  if (!prefix) return
  const [n0, ...args] = body.slice(prefix.length).trim().split(/\s+/)
  const name = (n0 || '').toLowerCase()
  const isPlay = ['play', 'musica', 'p'].includes(name)
  const isMenu = ['menu', 'help', 'ayuda'].includes(name)
  const isPing = name === 'ping'
  if (!isPlay && !isMenu && !isPing) return

  const who = m.key.fromMe ? 'yo:' + phone : (m.key.participant || chat)
  const key = who + (isPlay ? ':p' : ':n')
  if (Date.now() - (last.get(key) || 0) < (isPlay ? 15000 : 3000)) return
  last.set(key, Date.now())
  if (last.size > 500) last.delete(last.keys().next().value)

  const reply = text => sock.sendMessage(chat, { text }, { quoted: m })
  console.log('💬', phone, name, args.join(' ').slice(0, 40))

  if (isPing) return reply('🏓 Pong!')
  if (isMenu) {
    const s = Math.floor((Date.now() - started) / 1000)
    return reply(
      '*YUTA PLAY* · _bot de música_\n\n' +
      '› `.play` _nombre o link_\n   Descarga la canción en audio.\n' +
      '› `.ping`\n   Comprueba que el bot responde.\n' +
      '› `.menu`\n   Muestra este mensaje.\n\n' +
      'Prefijos: `.` `,`\n' +
      '_Activo hace ' + Math.floor(s / 3600) + 'h ' + (Math.floor(s / 60) % 60) + 'm_\n' + SITE
    )
  }

  const q = args.join(' ').trim()
  if (!q) return reply('Uso: `.play` _nombre de la canción o link de YouTube_\nEj: `.play montagem apollo`')
  if (pending >= 3) return reply('⏳ Hay muchas descargas ahora mismo. Intenta en un momento.')
  if (pending > 0) await reply('⏳ Estás en cola, ya empiezo.')
  await sock.sendMessage(chat, { react: { text: '🔎', key: m.key } }).catch(() => {})

  try {
    await enqueue(async () => {
      const item = await findSong(q)
      if (!item) return reply('❌ No encontré esa canción. Prueba con otro nombre.')
      const cap =
        '╭─〔 🎧 *YUTA PLAY* 〕\n│ 🎵 *' + (item.title || 'Audio de YouTube') + '*\n│ 👤 ' + (item.by || '-') +
        (item.dur ? '\n│ ⏱️ ' + item.dur : '') + '\n╰──────────────\n⏳ _Descargando el audio..._'
      try { await sock.sendMessage(chat, { image: { url: item.img }, caption: cap }, { quoted: m }) }
      catch { await reply(cap) }

      const a = await getAudio(item)
      let out = a.buf, mime = 'audio/mpeg', ext = 'mp3'
      if (!/mpeg|mp3/i.test(a.ct)) {
        try { out = await toMp3(a.buf) }
        catch (e) { console.log('⚠ sin conversión a mp3:', e.message); mime = 'audio/mp4'; ext = 'm4a' }
      }
      const fname = ((item.title || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'audio') + '.' + ext
      await sock.sendMessage(chat, { audio: out, mimetype: mime, fileName: fname }, { quoted: m })
      await sock.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
    })
  } catch (e) {
    console.log('PLAY ERROR:', e.message)
    await reply('❌ ' + String(e.message || 'No pude descargar el audio').slice(0, 200)).catch(() => {})
  }
}

module.exports = { handle }
