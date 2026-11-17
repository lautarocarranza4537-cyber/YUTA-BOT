const fs = require('fs')
const path = require('path')
const pino = require('pino')
const {
  default: makeWASocket, useMultiFileAuthState, DisconnectReason,
  fetchLatestBaileysVersion, Browsers
} = require('@whiskeysockets/baileys')
const cmd = require('./wacmd')

const DIR = path.join(__dirname, 'sessions')
const MAX = Number(process.env.MAX_SESSIONS) || 2
const PAIR_TTL = 3 * 60 * 1000
const sessions = new Map()
const byIp = new Map()
const byPhone = new Map()
fs.mkdirSync(DIR, { recursive: true })

const clean = n => String(n || '').replace(/\D/g, '')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fail = (status, msg) => Object.assign(new Error(msg), { status })
const wipe = phone => fs.rmSync(path.join(DIR, phone), { recursive: true, force: true })

// Envío escalonado: cola, "escribiendo..." y pausas (más natural para WhatsApp)
function throttle(sock) {
  const raw = sock.sendMessage.bind(sock)
  let chain = Promise.resolve()
  sock.sendMessage = (jid, content = {}, opts) => {
    const job = chain.then(async () => {
      const media = content.audio || content.image || content.video || content.sticker
      if (content.react || content.delete || media) await sleep(150 + Math.random() * 250)
      else {
        try {
          await sock.sendPresenceUpdate('composing', jid)
          const len = (content.text || '').length
          await sleep(Math.min(1200, 250 + len * 5) + Math.random() * 300)
          await sock.sendPresenceUpdate('paused', jid)
        } catch {}
      }
      return Promise.race([
        raw(jid, content, opts),
        new Promise((_, rej) => setTimeout(() => rej(new Error('el envío tardó demasiado')), 90000))
      ])
    })
    chain = job.catch(() => {})
    return job
  }
}

function drop(phone, erase = true) {
  const s = sessions.get(phone)
  if (s) {
    s.dead = true
    clearTimeout(s.timer)
    try { s.sock && s.sock.end(undefined) } catch {}
    sessions.delete(phone)
  }
  if (erase) wipe(phone)
}

function reconnect(phone, s, quick) {
  if (s.dead) return
  s.retries = (s.retries || 0) + 1
  if (s.retries > 8) { console.log('⚠ demasiados reintentos', phone); return drop(phone, false) }
  const wait = quick ? 500 : Math.min(60000, 3000 * 2 ** s.retries)
  setTimeout(() => { if (!s.dead) start(phone, false).catch(e => console.log('reinicio falló', phone, e.message)) }, wait)
}

async function start(phone, wantCode) {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(DIR, phone))
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version, auth: state, logger: pino({ level: 'silent' }),
    printQRInTerminal: false, browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false, syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async () => undefined
  })
  throttle(sock)
  if (cmd.attach) cmd.attach(sock, phone)

  const s = sessions.get(phone) || { retries: 0 }
  s.sock = sock
  s.state = sock.authState.creds.registered ? 'connecting' : 'pairing'
  sessions.set(phone, s)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (s.sock !== sock || s.dead) return
    if (connection === 'open') {
      s.state = 'open'; s.retries = 0; clearTimeout(s.timer)
      console.log('✅ WhatsApp vinculado:', phone)
    }
    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode
      if (code === DisconnectReason.loggedOut) { console.log('🚪 sesión cerrada:', phone); return drop(phone, true) }
      if (code === DisconnectReason.connectionReplaced) { console.log('⚠ otra instancia usa', phone); return drop(phone, false) }
      if (code === DisconnectReason.restartRequired) return reconnect(phone, s, true)
      if (sock.authState.creds.registered) { s.state = 'connecting'; return reconnect(phone, s, false) }
    }
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (s.sock !== sock || s.dead) return
    if (type !== 'notify' && type !== 'append') return
    for (const m of messages) {
      if (!m.message || m.key.remoteJid === 'status@broadcast') continue
      const t = m.messageTimestamp
      const ts = typeof t === 'object' ? (t && (t.toNumber ? t.toNumber() : t.low)) : Number(t)
      if (ts && Date.now() / 1000 - ts > 45) continue
      cmd.handle(sock, m, phone).catch(e => console.log('handler:', e.message))
    }
  })

  let code = null
  if (wantCode && !sock.authState.creds.registered) {
    await sleep(3000)
    code = await sock.requestPairingCode(phone)
    s.timer = setTimeout(() => {
      if (s.state !== 'open') { console.log('⌛ código vencido:', phone); drop(phone, true) }
    }, PAIR_TTL)
  }
  return code
}

function allow(ip, phone) {
  const now = Date.now()
  const arr = (byIp.get(ip) || []).filter(t => now - t < 10 * 60 * 1000)
  if (arr.length >= 4) throw fail(429, 'Demasiados intentos. Espera unos minutos.')
  if (now - (byPhone.get(phone) || 0) < 45000) throw fail(429, 'Espera un momento antes de pedir otro código.')
  arr.push(now); byIp.set(ip, arr); byPhone.set(phone, now)
}

async function link(rawPhone, ip) {
  const phone = clean(rawPhone)
  if (phone.length < 8 || phone.length > 15) throw fail(400, 'Escribe el número completo con código de país, sin + ni espacios.')
  const ex = sessions.get(phone)
  if (ex && ex.state === 'open') return { state: 'open' }
  if (ex && ex.sock && ex.sock.authState.creds.registered) return { state: ex.state }
  allow(ip, phone)
  if (!ex && sessions.size >= MAX) throw fail(409, 'Cupo lleno por ahora. Intenta más tarde.')
  if (ex) drop(phone, true)
  wipe(phone)
  try {
    const code = await start(phone, true)
    if (!code) throw new Error('sin código')
    return { state: 'pairing', code: code.match(/.{1,4}/g).join('-') }
  } catch (e) {
    console.log('⚠ no pude generar el código:', e.message)
    drop(phone, true)
    throw fail(502, 'No pude generar el código. Revisa el número e intenta en un minuto.')
  }
}

const readBody = req => new Promise((resolve, reject) => {
  let b = ''
  req.on('data', d => { b += d; if (b.length > 2000) { reject(fail(413, 'Solicitud muy grande')); req.destroy() } })
  req.on('end', () => resolve(b))
  req.on('error', reject)
})

async function http(req, res) {
  const u = new URL(req.url, 'http://x')
  if (!u.pathname.startsWith('/api/wa/')) return false
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(obj))
  }
  try {
    if (u.pathname === '/api/wa/link' && req.method === 'POST') {
      let body = {}
      try { body = JSON.parse((await readBody(req)) || '{}') } catch { throw fail(400, 'Solicitud inválida') }
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
      send(200, await link(body.phone, ip))
    } else if (u.pathname === '/api/wa/status') {
      const s = sessions.get(clean(u.searchParams.get('phone')))
      send(200, { state: s ? s.state : 'none', used: sessions.size, max: MAX })
    } else if (u.pathname === '/api/wa/commands') {
      send(200, { commands: cmd.list ? cmd.list() : [] })
    } else send(404, { error: 'No existe' })
  } catch (e) {
    send(e.status || 500, { error: e.message })
  }
  return true
}

// Al arrancar, retoma las sesiones que ya estaban vinculadas (si hay disco)
function boot() {
  let dirs = []
  try { dirs = fs.readdirSync(DIR).filter(d => /^\d{8,15}$/.test(d)) } catch {}
  dirs.slice(0, MAX).forEach((p, i) => setTimeout(() => {
    try {
      const creds = JSON.parse(fs.readFileSync(path.join(DIR, p, 'creds.json'), 'utf8'))
      if (!creds.registered) return wipe(p)
    } catch { return wipe(p) }
    sessions.set(p, { retries: 0 })
    start(p, false).catch(e => console.log('no pude retomar', p, e.message))
  }, 3000 + i * 4000))
}
setTimeout(boot, 2500)

module.exports = { http, boot }
