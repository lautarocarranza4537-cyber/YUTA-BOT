
// --- COMANDO .PIN (Solo Imágenes) ---
add(['pin', 'pinterest'], 'Herramientas', 'Busca imágenes limpias en Pinterest', async c => {
    if (!c.text) return c.reply('Uso: .pin <búsqueda>');
    await c.reply('🔎 Buscando imagen...');
    try {
        const res = await fetch(`https://itzpire.com/search/pinterest?query=${encodeURIComponent(c.text)}`);
        const json = await res.json();
        const results = json.result || json.data || [];
        const imgItem = results.find(x => typeof x === 'string' || (x.image && !x.video)) || results[0];
        const imgUrl = typeof imgItem === 'string' ? imgItem : (imgItem?.image || imgItem?.url);
        if (!imgUrl) return c.reply('❌ No se encontró imagen.');
        await c.sock.sendMessage(c.chat, { image: { url: imgUrl }, caption: `📌 Pin: ${c.text}` }, { quoted: c.msg });
    } catch (e) { c.reply('❌ Error al obtener imagen.'); }
});

// --- COMANDO .PINVIDEO (Exclusivo Videos) ---
add(['pinvideo', 'pinstory'], 'Herramientas', 'Busca videos en Pinterest', async c => {
    if (!c.text) return c.reply('Uso: .pinvideo <búsqueda>');
    await c.reply('🎬 Buscando video...');
    try {
        const res = await fetch(`https://itzpire.com/search/pinterest?query=${encodeURIComponent(c.text)}`);
        const json = await res.json();
        const results = json.result || json.data || [];
        const videoItem = results.find(x => x.video || (x.url && x.url.includes('.mp4')));
        if (!videoItem) return c.reply('❌ No se encontró video.');
        await c.sock.sendMessage(c.chat, { video: { url: videoItem.video || videoItem.url }, caption: `🎥 Pin Video: ${c.text}` }, { quoted: c.msg });
    } catch (e) { c.reply('❌ Error al obtener video.'); }
});

// --- COMANDO .PLAYAUDIO (Audio / Nota de voz) ---
add(['playaudio', 'pya'], 'Descargas', 'Envía audio de YouTube como nota de voz', { usage: '<nombre>' }, async c => {
    if (!c.text) return c.reply('Uso: .playaudio <nombre o link>');
    await c.reply('🎧 Procesando audio...');
    const config = require('./config');
    const apiUrl = config.apiUrl || 'http://localhost:3000';
    const mediaUrl = `${apiUrl}/api/audio?q=${encodeURIComponent(c.text)}`;
    try {
        await c.sock.sendMessage(c.chat, { audio: { url: mediaUrl }, mimetype: 'audio/mp4', ptt: true }, { quoted: c.msg });
    } catch (e) { c.reply('❌ Error al enviar el audio.'); }
});
