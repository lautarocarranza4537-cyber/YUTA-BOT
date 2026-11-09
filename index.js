import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import readline from 'readline';
import pino from 'pino';
import fs from 'fs';
import yts from 'yt-search';
import { exec } from 'child_process';
import util from 'util';
import { config } from './config.js';

const execAsync = util.promisify(exec);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const sessionPath = process.env.RENDER || process.env.ORACLE ? 'sessions' : config.sessionDir;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        version,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        const ownerPhone = process.env.OWNER_NUMBER || config.ownerNumber;
        console.log(`\n📱 Solicitando código de emparejamiento para el número: ${ownerPhone}`);
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(ownerPhone);
                console.log(`\n==================================================`);
                console.log(`🔑 TU CÓDIGO DE VINCULACIÓN DE 8 DÍGITOS ES: ${code}`);
                console.log(`==================================================\n`);
            } catch (err) {
                console.error('Error al solicitar el código:', err);
            }
        }, 4000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('⚡ ¡Bot de Música conectado a WhatsApp exitosamente!');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            const remoteJid = mek.key.remoteJid;
            const messageType = Object.keys(mek.message)[0];
            let text = '';

            if (messageType === 'conversation') {
                text = mek.message.conversation;
            } else if (messageType === 'extendedTextMessage') {
                text = mek.message.extendedTextMessage.text;
            } else if (messageType === 'imageMessage' && mek.message.imageMessage.caption) {
                text = mek.message.imageMessage.caption;
            }

            if (!text) return;
            const lowerText = text.toLowerCase();

            // COMANDO .PLAY
            if (lowerText.startsWith('.play ')) {
                const query = text.slice(6).trim();
                if (!query) {
                    await sock.sendMessage(remoteJid, { text: '❌ Por favor escribe el nombre o link de la canción. Ej: .play phonk' }, { quoted: mek });
                    return;
                }

                await sock.sendMessage(remoteJid, { text: `🔍 Buscando "${query}"...` }, { quoted: mek });
                console.log(`🎵 Buscando canción: ${query}`);

                let videoUrl = query;
                let videoTitle = query;

                if (!query.startsWith('http')) {
                    const searchResult = await yts(query);
                    if (!searchResult || searchResult.videos.length === 0) {
                        await sock.sendMessage(remoteJid, { text: '❌ No se encontró ningún resultado para esa búsqueda.' }, { quoted: mek });
                        return;
                    }
                    const topVideo = searchResult.videos[0];
                    videoUrl = topVideo.url;
                    videoTitle = topVideo.title;
                }

                await sock.sendMessage(remoteJid, { text: `📥 Descargando: *${videoTitle}*\n⏳ Espera un momento...` }, { quoted: mek });

                // Descargamos en formato nativo de mejor audio sin requerir ffmpeg
                const audioPath = `./audio_${Date.now()}.webm`;

                try {
                    // Usamos -f ba (best audio) sin postprocesamiento
                    await execAsync(`yt-dlp -f ba -o "${audioPath}" "${videoUrl}"`);

                    if (!fs.existsSync(audioPath)) {
                        throw new Error('El archivo de audio no se generó.');
                    }

                    console.log(`📤 Enviando audio a WhatsApp: ${videoTitle}`);
                    await sock.sendMessage(remoteJid, { 
                        audio: fs.readFileSync(audioPath), 
                        mimetype: 'audio/mp4', 
                        ptt: false,
                        caption: `🎶 Aquí tienes: *${videoTitle}*`
                    }, { quoted: mek });

                    // Borrar el archivo localmente
                    fs.unlinkSync(audioPath);
                    console.log(`✅ ¡Enviado y limpiado con éxito!`);

                } catch (e) {
                    console.error('Error descargando audio:', e);
                    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
                    await sock.sendMessage(remoteJid, { text: '❌ Ocurrió un error al descargar la canción.' }, { quoted: mek });
                }
            }

        } catch (e) {
            console.error('Error procesando mensaje:', e);
        }
    });
}

startBot();
