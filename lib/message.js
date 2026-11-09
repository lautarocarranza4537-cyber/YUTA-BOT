import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const plugins = new Map();

export async function loadPlugins() {
    const pluginsDir = path.resolve('plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    
    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    for (const file of files) {
        const pluginPath = path.join(pluginsDir, file);
        const pluginModule = await import(`file://${pluginPath}`);
        const commandName = file.replace('.js', '');
        plugins.set(commandName, pluginModule.default);
    }
    console.log(`📦 Plugins cargados: ${plugins.size}`);
}

export async function handleMessage(sock, m) {
    if (!m.message) return;

    const remoteJid = m.key.remoteJid;
    const messageContent = m.message.conversation || 
                           m.message.extendedTextMessage?.text || 
                           m.message.imageMessage?.caption || '';

    let usedPrefix = null;
    for (const p of config.prefix) {
        if (messageContent.startsWith(p)) {
            usedPrefix = p;
            break;
        }
    }

    if (!usedPrefix) return;

    const args = messageContent.slice(usedPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const q = args.join(' ');

    if (plugins.has(command)) {
        try {
            await plugins.get(command)({ sock, m, remoteJid, args, q, command });
        } catch (err) {
            console.error(`Error en comando ${command}:`, err);
            await sock.sendMessage(remoteJid, { text: `⚠️ Ocurrió un error al ejecutar el comando: ${err.message}` }, { quoted: m });
        }
    }
}
