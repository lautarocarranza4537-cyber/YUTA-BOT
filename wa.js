const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')

let handler = null
try { handler = require('./handler') } catch {}

let sock = null
let connectionStatus = 'disconnected'
let connectedUser = null
const SESSION_DIR = path.join(__dirname, 'session_yuta')

async function startBot() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'connecting') {
      connectionStatus = 'connecting'
    } else if (connection === 'open') {
      connectionStatus = 'connected'
      connectedUser = sock.user ? sock.user.id.split(':')[0] : 'Conectado'
      console.log('⚡ [BAILEYS] Conectado con éxito:', connectedUser)
    } else if (connection === 'close') {
      connectionStatus = 'disconnected'
      connectedUser = null
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) fs.rmSync(SESSION_DIR, { recursive: true, force: true })
      if (code !== DisconnectReason.loggedOut) setTimeout(startBot, 4000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!msg.message) continue
      if (handler && typeof handler === 'function') {
        try { await handler(sock, msg) } catch (err) { console.error('Error handler:', err) }
      }
    }
  })
  return sock
}

startBot().catch(console.error)

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', c => (data += c))
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
  })
}

const sendJson = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

async function http(req, res) {
  const u = new URL(req.url, 'http://localhost')
  const p = u.pathname

  if (p === '/api/status' && req.method === 'GET') {
    sendJson(res, 200, { status: connectionStatus, user: connectedUser })
    return true
  }

  if (p === '/api/pair' && req.method === 'POST') {
    const body = await readBody(req)
    // Limpieza estricta: solo números, sin signo + ni espacios
    const rawNumber = String(body.number || '').replace(/[^0-9]/g, '')

    if (!rawNumber || rawNumber.length < 10) {
      sendJson(res, 400, { ok: false, error: 'Número inválido. Usa formato sin +, ej: 5493513157041' })
      return true
    }

    try {
      if (connectionStatus === 'connected') {
        sendJson(res, 200, { ok: true, alreadyConnected: true, user: connectedUser })
        return true
      }
      if (!sock) await startBot()
      await new Promise(r => setTimeout(r, 2000))

      const code = await sock.requestPairingCode(rawNumber)
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code
      sendJson(res, 200, { ok: true, code: formatted })
    } catch (e) {
      sendJson(res, 500, { ok: false, error: 'Error al generar código en WhatsApp. Intenta de nuevo.' })
    }
    return true
  }

  if (p === '/api/logout' && req.method === 'POST') {
    try { if (sock) await sock.logout() } catch {}
    fs.rmSync(SESSION_DIR, { recursive: true, force: true })
    connectionStatus = 'disconnected'
    connectedUser = null
    setTimeout(startBot, 2000)
    sendJson(res, 200, { ok: true })
    return true
  }

  return false
}

module.exports = { http, getSock: () => sock }
