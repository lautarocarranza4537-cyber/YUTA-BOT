const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys')

const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
const TL = new Set(['es', 'en', 'pt', 'fr', 'it', 'de', 'ja', 'ko', 'ru', 'ar', 'hi', 'id', 'tr', 'nl', 'pl', 'ca', 'uk', 'sv', 'el', 'he', 'vi', 'th', 'zh-cn', 'zh-tw'])
const WC = { 0: 'Despejado ☀️', 1: 'Mayormente despejado 🌤️', 2: 'Parcialmente nublado ⛅', 3: 'Nublado ☁️', 45: 'Niebla 🌫️', 48: 'Niebla 🌫️', 51: 'Llovizna ligera 🌦️', 53: 'Llovizna 🌦️', 55: 'Llovizna intensa 🌧️', 61: 'Lluvia ligera 🌧️', 63: 'Lluvia 🌧️', 65: 'Lluvia fuerte 🌧️', 71: 'Nieve ligera 🌨️', 73: 'Nieve 🌨️', 75: 'Nieve fuerte ❄️', 80: 'Chubascos 🌦️', 81: 'Chubascos 🌧️', 82: 'Chubascos fuertes ⛈️', 95: 'Tormenta ⛈️', 96: 'Tormenta con granizo ⛈️', 99: 'Tormenta con granizo ⛈️' }

const strip = m => {
  const c = m && m.message
  if (!c) return null
  return (c.ephemeralMessage && c.ephemeralMessage.message) || (c.viewOnceMessage && c.viewOnceMessage.message) ||
    (c.viewOnceMessageV2 && c.viewOnceMessageV2.message) || (c.viewOnceMessageV2Extension && c.viewOnceMessageV2Extension.message) ||
    (c.documentWithCaptionMessage && c.documentWithCaptionMessage.message) || c
}
const isHttp = u => { try { return /^https?:$/.test(new URL(u).protocol) } catch { return false } }
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const J = async (u, ms = 12000, headers = {}) => {
  const r = await fetch(u, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

module.exports = H => {
  const { add, norm, convert } = H
  const media = (c, types) => {
    for (const x of [c.quoted, c.m]) {
      const cc = strip(x)
      if (!cc) continue
      for (const t of types) if (cc[t]) return { msg: x, inner: cc[t], type: t }
    }
    return null
  }
  const dlm = (c, m) => downloadMediaMessage(m, 'buffer', {}, { reuploadRequest: c.sock.updateMediaMessage })
  const qtext = c => { const q = c.ctx && c.ctx.quotedMessage; return (q && (q.conversation || (q.extendedTextMessage && q.extendedTextMessage.text))) || '' }

  // ───── Convertir ─────
  add(['codigoqr', 'qr', 'crearqr', 'qrcode', 'qrgen'], 'Convertir', 'Crea un código QR con un texto o enlace', { usage: '<texto o enlace>', heavy: true }, async c => {
    const t = c.text.trim().slice(0, 800)
    if (!t) return c.reply('Uso: `' + c.prefix + 'qr` _texto o enlace_')
    const r = await fetch('https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=' + encodeURIComponent(t), { signal: AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error('No pude crear el QR')
    await c.sock.sendMessage(c.chat, { image: Buffer.from(await r.arrayBuffer()), caption: '✅ Aquí tienes tu QR' }, { quoted: c.m })
  })

  add(['ocr', 'leerimg', 'leertexto', 'textofoto'], 'Convertir', 'Saca el texto de una foto (responde a una foto)', { heavy: true }, async c => {
    const m = media(c, ['imageMessage'])
    if (!m) return c.reply('Responde a una foto con `' + c.prefix + 'ocr`.')
    const buf = await convert(await dlm(c, m.msg), 'jpg', 'jpg', ['-vf', 'scale=min(1400\\,iw):-2', '-q:v', '5'])
    const body = new URLSearchParams({ apikey: 'helloworld', language: 'spa', isOverlayRequired: 'false', base64Image: 'data:image/jpeg;base64,' + buf.toString('base64') })
    const r = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body, signal: AbortSignal.timeout(40000) })
    const j = await r.json().catch(() => ({}))
    if (j.IsErroredOnProcessing) throw new Error(String((j.ErrorMessage && j.ErrorMessage[0]) || j.ErrorMessage || 'No pude leer la imagen').slice(0, 120))
    const t = ((j.ParsedResults || []).map(x => x.ParsedText).join('\n')).trim()
    if (!t) return c.reply('No encontré texto en esa foto.')
    await c.reply('📝 *Texto de la foto*\n\n' + cut(t, 3000))
  })

  add(['tomp3', 'toaudio', 'toaud', 'videoaudio'], 'Convertir', 'Saca el audio de un video (responde a un video)', { heavy: true }, async c => {
    const m = media(c, ['videoMessage', 'audioMessage'])
    if (!m) return c.reply('Responde a un video con `' + c.prefix + 'tomp3`.')
    const out = await convert(await dlm(c, m.msg), 'bin', 'mp3', ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k'], 120000)
    await c.sock.sendMessage(c.chat, { audio: out, mimetype: 'audio/mpeg' }, { quoted: c.m })
  })

  add(['revelar', 'readviewonce', 'rvo', 'ver1'], 'Convertir', 'Te manda a tu chat una foto, video o audio de una sola vez (solo dueño)', { owner: true }, async c => {
    const q = c.quoted
    if (!q) return c.reply('Responde a una foto, video o audio de una sola vez con `' + c.prefix + 'revelar`.')
    const cc = strip(q)
    const t = ['imageMessage', 'videoMessage', 'audioMessage'].find(k => cc && cc[k])
    if (!t) return c.reply('Eso no es una foto, video o audio.')
    const buf = await dlm(c, q)
    const me = jidNormalizedUser(c.sock.user.id)
    const payload = t === 'imageMessage' ? { image: buf } : t === 'videoMessage' ? { video: buf } : { audio: buf, mimetype: cc.audioMessage.mimetype || 'audio/ogg; codecs=opus' }
    await c.sock.sendMessage(me, payload)
    await c.reply('✅ Te lo mandé a tu chat personal.')
  })

  add(['todoc', 'tofile', 'adocumento', 'comodocumento'], 'Convertir', 'Manda un archivo como documento, sin perder calidad (responde al archivo)', { heavy: true }, async c => {
    const m = media(c, ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'])
    if (!m) return c.reply('Responde a una foto, video, audio o sticker con `' + c.prefix + 'todoc`.')
    const mime = m.inner.mimetype || 'application/octet-stream'
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' })[mime.split(';')[0]] || (mime.split('/')[1] || 'bin').split(';')[0]
    await c.sock.sendMessage(c.chat, { document: await dlm(c, m.msg), mimetype: mime, fileName: m.inner.fileName || 'archivo.' + ext }, { quoted: c.m })
  })

  add(['tourl', 'subir', 'upload', 'enlacearchivo'], 'Convertir', 'Sube un archivo y te da su enlace (responde al archivo)', { heavy: true }, async c => {
    const m = media(c, ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'])
    if (!m) return c.reply('Responde a una foto, video, audio o documento con `' + c.prefix + 'tourl`.')
    const buf = await dlm(c, m.msg)
    if (buf.length > 20 * 1048576) return c.reply('El archivo es muy pesado (máx 20 MB).')
    const mime = (m.inner.mimetype || 'application/octet-stream').split(';')[0]
    const fd = new FormData()
    fd.append('reqtype', 'fileupload')
    fd.append('fileToUpload', new Blob([buf], { type: mime }), m.inner.fileName || 'archivo.' + (mime.split('/')[1] || 'bin'))
    const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd, signal: AbortSignal.timeout(90000) })
    const t = (await r.text()).trim()
    if (!/^https:\/\//.test(t)) throw new Error('El servicio no aceptó el archivo')
    await c.reply('🔗 ' + t + '\n\n_Es un enlace público: cualquiera que lo tenga puede verlo._')
  })

  add(['hd', 'enhance', 'remini', 'hdr'], 'Convertir', 'Agranda una foto al doble y la enfoca (responde a una foto)', { heavy: true }, async c => {
    const m = media(c, ['imageMessage'])
    if (!m) return c.reply('Responde a una foto con `' + c.prefix + 'hd`.')
    const out = await convert(await dlm(c, m.msg), 'jpg', 'jpg', ['-vf', 'scale=w=min(iw*2\\,2400):h=-2:flags=lanczos,unsharp=5:5:1.0:5:5:0.0', '-frames:v', '1', '-q:v', '2'], 120000)
    await c.sock.sendMessage(c.chat, { image: out, caption: '✨ Mejorada' }, { quoted: c.m })
  })

  add(['editar', 'editimg', 'editarfoto', 'setimg'], 'Convertir', 'Edita una foto: tamaño, girar, recortar, comprimir y más', { usage: '<qué hacer> [valor]', heavy: true }, async c => {
    const m = media(c, ['imageMessage'])
    const op = norm(c.args[0])
    const ops = 'tamano, girar, voltear, espejo, gris, negativo, difuminar, recortar, comprimir'
    if (!m || !op) return c.reply('Responde a una foto con `' + c.prefix + 'editar` _qué hacer_\n*Opciones:* ' + ops + '\nEj: `' + c.prefix + 'editar girar 90`, `' + c.prefix + 'editar tamano 800`')
    const v = parseInt(c.args[1], 10)
    let vf = null, q = '2'
    switch (op) {
      case 'tamano': case 'size': case 'resize':
        if (!v) return c.reply('Uso: `' + c.prefix + 'editar tamano 800` (ancho en píxeles)')
        vf = 'scale=' + Math.min(4000, Math.max(50, v)) + ':-2'; break
      case 'girar': case 'rotar': {
        const d = [90, 180, 270].includes(v) ? v : 90
        vf = d === 180 ? 'transpose=1,transpose=1' : d === 270 ? 'transpose=2' : 'transpose=1'; break
      }
      case 'voltear': vf = 'vflip'; break
      case 'espejo': vf = 'hflip'; break
      case 'gris': vf = 'hue=s=0'; break
      case 'negativo': vf = 'negate'; break
      case 'difuminar': case 'blur': vf = 'boxblur=' + Math.min(20, Math.max(1, v || 6)) + ':1'; break
      case 'recortar': case 'crop': vf = 'crop=min(iw\\,ih):min(iw\\,ih)'; break
      case 'comprimir': {
        const p = Math.min(90, Math.max(5, v || 40))
        q = String(Math.max(2, Math.min(31, Math.round(31 - p * 0.29))))
        vf = 'scale=min(1280\\,iw):-2'; break
      }
      default: return c.reply('No conozco esa opción.\n*Opciones:* ' + ops)
    }
    const out = await convert(await dlm(c, m.msg), 'jpg', 'jpg', ['-vf', vf, '-frames:v', '1', '-q:v', q], 90000)
    await c.sock.sendMessage(c.chat, { image: out, caption: '✅ Listo' }, { quoted: c.m })
  })

  // ───── Herramientas ─────
  add(['repetir', 'echo', 'repite', 'dilo'], 'Herramientas', 'El bot repite lo que escribas (sin menciones)', { usage: '<texto>' }, async c => {
    if (!c.text) return c.reply('Escribe algo.')
    await c.sock.sendMessage(c.chat, { text: c.text.replace(/@/g, '＠') })
  })
  add(['voces', 'voices', 'idiomasvoz'], 'Herramientas', 'Idiomas que puede hablar tts', async c => {
    await c.reply('🎙️ *Idiomas de tts*\n' + [...H.LANGS].join(', ') + '\n\nEj: `' + c.prefix + 'tts en hello`')
  })

  // ───── Buscar ─────
  add(['clima', 'weather', 'tiempo', 'pronostico'], 'Buscar', 'El tiempo de una ciudad: ahora y los próximos días', { usage: '<ciudad>', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'clima` _Córdoba_')
    const g = await J('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=' + encodeURIComponent(q))
    const p = g.results && g.results[0]
    if (!p) return c.reply('No encontré esa ciudad.')
    const w = await J('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4')
    const n = w.current, d = w.daily
    let t = '🌍 *' + p.name + (p.admin1 ? ', ' + p.admin1 : '') + (p.country ? ' · ' + p.country : '') + '*\n\n' +
      (WC[n.weather_code] || 'Variable') + '\n🌡️ ' + Math.round(n.temperature_2m) + '°C (sensación ' + Math.round(n.apparent_temperature) + '°C)\n💧 Humedad: ' + n.relative_humidity_2m + '%\n💨 Viento: ' + Math.round(n.wind_speed_10m) + ' km/h\n\n*Próximos días*\n'
    for (let i = 1; i < d.time.length; i++) {
      const day = new Date(d.time[i] + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long' })
      t += '› ' + day + ': ' + Math.round(d.temperature_2m_min[i]) + '° / ' + Math.round(d.temperature_2m_max[i]) + '° · ' + (WC[d.weather_code[i]] || 'Variable') + ' · ☔ ' + (d.precipitation_probability_max[i] || 0) + '%\n'
    }
    await c.reply(t.trim())
  })

  add(['traducir', 'translate', 'traductor', 'trad'], 'Buscar', 'Traduce un texto (si no dices el idioma, al español)', { usage: '[idioma] <texto>', heavy: true }, async c => {
    const args = [...c.args]
    const qt = qtext(c)
    let tl = 'es'
    if (args[0] && TL.has(args[0].toLowerCase()) && (args.length > 1 || qt)) tl = args.shift().toLowerCase()
    const text = (args.join(' ') || qt).trim().slice(0, 1500)
    if (!text) return c.reply('Uso: `' + c.prefix + 'traducir` _en hola, ¿cómo estás?_\nO responde a un mensaje con `' + c.prefix + 'traducir`.')
    const j = await J('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text), 10000)
    const out = (j[0] || []).map(x => x && x[0]).filter(Boolean).join('').trim()
    if (!out) throw new Error('No pude traducir eso')
    await c.reply('🌐 *' + (j[2] || '?') + ' → ' + tl + '*\n\n' + out)
  })

  add(['wiki', 'wikipedia', 'buscarwiki'], 'Buscar', 'Busca algo en Wikipedia y te da el resumen', { usage: '<búsqueda>', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'wiki` _Lionel Messi_')
    const s = await J('https://es.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&search=' + encodeURIComponent(q))
    const title = s[1] && s[1][0]
    if (!title) return c.reply('No encontré nada en Wikipedia sobre eso.')
    const d = await J('https://es.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')))
    const link = d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page
    await c.reply('📚 *' + d.title + '*\n\n' + cut(d.extract, 900) + (link ? '\n\n🔗 ' + link : '') + '\n_Fuente: Wikipedia_')
  })

  add(['githubsearch', 'github', 'gts', 'ghs', 'ghsearch'], 'Buscar', 'Busca repositorios en GitHub (o el perfil de alguien con @usuario)', { usage: '<búsqueda> | @usuario', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'github` _whatsapp bot_ o `' + c.prefix + 'github` _@usuario_')
    const H2 = { Accept: 'application/vnd.github+json' }
    if (q.startsWith('@')) {
      const u = await J('https://api.github.com/users/' + encodeURIComponent(q.slice(1)), 10000, H2)
      return c.reply('👤 *' + (u.name || u.login) + '* (@' + u.login + ')\n' + (u.bio ? cut(u.bio, 200) + '\n' : '') + '\n› Repos: ' + u.public_repos + '\n› Seguidores: ' + u.followers + '\n› Siguiendo: ' + u.following + '\n\n🔗 ' + u.html_url)
    }
    const r = await J('https://api.github.com/search/repositories?per_page=5&q=' + encodeURIComponent(q), 10000, H2)
    if (!r.items || !r.items.length) return c.reply('No encontré repositorios.')
    await c.reply('🐙 *GitHub: ' + cut(q, 40) + '*\n\n' + r.items.map(x => '*' + x.full_name + '* ⭐ ' + x.stargazers_count + '\n' + cut(x.description || 'Sin descripción', 100) + '\n' + x.html_url).join('\n\n'))
  })

  add(['npm', 'npmjs', 'npmsearch'], 'Buscar', 'Busca paquetes de NPM', { usage: '<paquete o búsqueda>', heavy: true }, async c => {
    const q = c.text.trim()
    if (!q) return c.reply('Uso: `' + c.prefix + 'npm` _express_')
    const r = await J('https://registry.npmjs.org/-/v1/search?size=5&text=' + encodeURIComponent(q))
    if (!r.objects || !r.objects.length) return c.reply('No encontré paquetes.')
    await c.reply('📦 *NPM: ' + cut(q, 40) + '*\n\n' + r.objects.map(o => '*' + o.package.name + '* v' + o.package.version + '\n' + cut(o.package.description || 'Sin descripción', 100) + '\nhttps://www.npmjs.com/package/' + o.package.name).join('\n\n'))
  })

  add(['acortar', 'short', 'shorturl', 'shorten'], 'Buscar', 'Acorta un enlace largo', { usage: '<enlace>', heavy: true }, async c => {
    const u = c.text.trim() || qtext(c).trim()
    if (!isHttp(u)) return c.reply('Uso: `' + c.prefix + 'acortar` _https://enlace-muy-largo.com/…_')
    const r = await fetch('https://is.gd/create.php?format=simple&url=' + encodeURIComponent(u), { signal: AbortSignal.timeout(12000) })
    const t = (await r.text()).trim()
    if (!/^https:\/\//.test(t)) throw new Error('No pude acortar ese enlace')
    await c.reply('🔗 ' + t)
  })

  add(['ss', 'screenshot', 'captura', 'web'], 'Buscar', 'Captura de pantalla de una página web', { usage: '<enlace>', heavy: true }, async c => {
    const u = c.text.trim() || qtext(c).trim()
    if (!isHttp(u)) return c.reply('Uso: `' + c.prefix + 'ss` _https://ejemplo.com_')
    const r = await fetch('https://image.thum.io/get/width/1280/crop/900/noanimate/' + u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) })
    if (!r.ok || !/image/i.test(r.headers.get('content-type') || '')) throw new Error('No pude sacar la captura')
    await c.sock.sendMessage(c.chat, { image: Buffer.from(await r.arrayBuffer()), caption: '🖼️ ' + cut(u, 120) }, { quoted: c.m })
  })
}
