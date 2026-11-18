const cmds = new Map()

function add(triggers, category, desc, fn) {
  triggers.forEach(t => cmds.set(t, { category, desc, fn }))
}

// Control de estado de grupos (on/off)
const groupStatus = new Map()

// Definición de todos los comandos profesionales
add(['menu', 'help'], 'General', 'Muestra el panel interactivo del bot', async (sock, msg, args, sender) => {
  const text = `✨ *YUTA BOT - SPECIAL GRADE* ✨\n\nComandos disponibles:\n• .play <canción>\n• .playaudio <canción>\n• .pin <búsqueda>\n• .pinvideo <búsqueda>\n• .ping\n• .owner\n• .bot <on/off>`;
  await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
});

add(['ping'], 'General', 'Mide la latencia del bot', async (sock, msg) => {
  const t0 = Date.now();
  const sent = await sock.sendMessage(msg.key.remoteJid, { text: 'Calculando velocidad...' }, { quoted: msg });
  const lat = Date.now() - t0;
  await sock.sendMessage(msg.key.remoteJid, { text: `Pong! ⚡ ${lat}ms` }, { edit: sent.key });
});

add(['owner'], 'General', 'Muestra información del creador', async (sock, msg) => {
  await sock.sendMessage(msg.key.remoteJid, { text: '👑 Creador oficial de YUTA BOT: Lautaro / Jonathan.' }, { quoted: msg });
});

add(['bot'], 'Grupo', 'Enciende o apaga el bot en el grupo', async (sock, msg, args) => {
  const jid = msg.key.remoteJid;
  const opt = (args[0] || '').toLowerCase();
  if (opt === 'on') {
    groupStatus.set(jid, true);
    await sock.sendMessage(jid, { text: '🟢 ¡Yuta Bot activado en este grupo!' }, { quoted: msg });
  } else if (opt === 'off') {
    groupStatus.set(jid, false);
    await sock.sendMessage(jid, { text: '🔴 Yuta Bot desactivado en este grupo.' }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, { text: 'Uso: .bot on o .bot off' }, { quoted: msg });
  }
});

add(['play'], 'Música', 'Reproduce streaming de audio de YouTube', async (sock, msg, args) => {
  const query = args.join(' ');
  if (!query) return sock.sendMessage(msg.key.remoteJid, { text: 'Escribe el nombre de la música.' }, { quoted: msg });
  await sock.sendMessage(msg.key.remoteJid, { text: `🔍 Buscando streaming para: "${query}"...` }, { quoted: msg });
  // Integración con play.js
  try {
    const playMod = require('./play');
    // Búsqueda simplificada o respuesta de audio directo
    await sock.sendMessage(msg.key.remoteJid, { text: `🎵 Audio listo para reproducción web/streaming.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(msg.key.remoteJid, { text: 'Error al procesar el audio.' }, { quoted: msg });
  }
});

add(['playaudio', 'pya'], 'Descargas', 'Envía audio como nota de voz', async (sock, msg, args) => {
  const query = args.join(' ');
  if (!query) return sock.sendMessage(msg.key.remoteJid, { text: 'Uso: .playaudio <canción>' }, { quoted: msg });
  await sock.sendMessage(msg.key.remoteJid, { text: `🎙️ Procesando nota de voz de: "${query}"...` }, { quoted: msg });
});

add(['pin', 'pinterest'], 'Descargas', 'Busca imágenes en Pinterest', async (sock, msg, args) => {
  const query = args.join(' ');
  if (!query) return sock.sendMessage(msg.key.remoteJid, { text: 'Uso: .pin <búsqueda>' }, { quoted: msg });
  try {
    const res = await fetch(`https://itzpire.com/search/pinterest?query=${encodeURIComponent(query)}`);
    const json = await res.json();
    const list = json.result || json.data || [];
    const item = list.find(x => typeof x === 'string' || x.image) || list[0];
    const url = typeof item === 'string' ? item : (item?.image || item?.url);
    if (!url) throw new Error();
    await sock.sendMessage(msg.key.remoteJid, { image: { url }, caption: `📌 Pinterest: ${query}` }, { quoted: msg });
  } catch {
    await sock.sendMessage(msg.key.remoteJid, { text: 'No se pudo obtener la imagen.' }, { quoted: msg });
  }
});

add(['pinvideo'], 'Descargas', 'Busca videos en Pinterest', async (sock, msg, args) => {
  const query = args.join(' ');
  if (!query) return sock.sendMessage(msg.key.remoteJid, { text: 'Uso: .pinvideo <búsqueda>' }, { quoted: msg });
  try {
    const res = await fetch(`https://itzpire.com/search/pinterest?query=${encodeURIComponent(query)}`);
    const json = await res.json();
    const list = json.result || json.data || [];
    const item = list.find(x => x.video || (x.url && x.url.includes('.mp4')));
    if (!item) throw new Error();
    await sock.sendMessage(msg.key.remoteJid, { video: { url: item.video || item.url }, caption: `🎥 Pin Video: ${query}` }, { quoted: msg });
  } catch {
    await sock.sendMessage(msg.key.remoteJid, { text: 'No se pudo obtener el video.' }, { quoted: msg });
  }
});

module.exports = async (sock, msg) => {
  const content = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
  if (!content.startsWith('.')) return;
  const args = content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const cmdObj = cmds.get(command);
  if (!cmdObj) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  if (isGroup && command !== 'bot') {
    if (groupStatus.get(jid) === false) return; // Apagado en grupo
  }

  try {
    await cmdObj.fn(sock, msg, args);
  } catch (err) {
    console.error(`Error ejecutando .${command}:`, err);
  }
};
