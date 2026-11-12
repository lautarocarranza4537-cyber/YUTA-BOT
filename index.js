const {
  default: makeWASocket, useMultiFileAuthState, DisconnectReason,
  fetchLatestBaileysVersion, Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const handler = require('./handler')
const db = require('./db')
const config = require('./config')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version, auth: state, logger: pino({ level: 'silent' }),
    printQRInTerminal: false, browser: Browsers.ubuntu('Chrome'), markOnlineOnConnect: false
  })

  if (!sock.authState.creds.registered) {
    const num = config.ownerNumber.replace(/\D/g, '')
    console.log(`\n📱 Solicitando código de emparejamiento automático para: ${num}`);
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(num)
        console.log('\n🔑 Tu código de vinculación:', code.match(/.{1,4}/g).join('-'))
        console.log('WhatsApp > Dispositivos vinculados > Vincular con número de teléfono\n')
      } catch (e) { console.log('Error pidiendo código:', e.message) }
    }, 3000)
  }

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') console.log('✅ YUTA-BOT conectado como', sock.user.id)
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        console.log('Sesión cerrada. Borra la carpeta "session" y vuelve a iniciar.')
      } else start()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      if (!m.message || m.key.remoteJid === 'status@broadcast') continue
      try { await handler(sock, m) } catch (e) { console.error(e) }
    }
  })

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (!db.group(id).welcome) return
    for (const p of participants) {
      const jid = typeof p === 'string' ? p : p.id
      const tag = '@' + jid.split('@')[0]
      if (action === 'add') await sock.sendMessage(id, { text: `👋 Bienvenido ${tag} al grupo!`, mentions: [jid] })
      if (action === 'remove') await sock.sendMessage(id, { text: `😿 ${tag} salió del grupo.`, mentions: [jid] })
    }
  })
}
start()
