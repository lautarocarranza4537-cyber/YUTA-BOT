const { spawn } = require('child_process')
const { Readable } = require('stream')
const C = require('./core') || {}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Múltiples clientes de YouTube anti-bloqueo y respaldos robustos
const IT_CLIENTS = [
  { name: 'android', id: 3, ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', ctx: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, osName: 'Android', osVersion: '11', hl: 'en', gl: 'US' } },
  { name: 'ios', id: 5, ua: 'com.google.ios.youtube/19.09.4 (iPhone14,3; U; CPU iOS 17_4 like Mac OS X)', ctx: { clientName: 'IOS', clientVersion: '19.09.4', deviceMake: 'Apple', deviceModel: 'iPhone14,3', osName: 'iPhone', osVersion: '17.4', hl: 'en', gl: 'US' } },
  { name: 'web', id: 1, ua: UA, ctx: { clientName: 'WEB', clientVersion: '2.20240314.05.00', hl: 'en', gl: 'US' } }
]

// Extraer metadatos y stream directo resistente a bloqueos
async function getAudioMetadataAndStream(queryOrUrl) {
  let videoId = ''
  if (/^[\w-]{11}$/.test(queryOrUrl)) {
    videoId = queryOrUrl
  } else {
    const match = queryOrUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/)
    videoId = match ? match[1] : null
  }

  // Si es búsqueda por texto, resolvemos con yt-search interno o dlp
  let targetUrl = videoId ? `https://youtu.be/${videoId}` : `ytsearch1:${queryOrUrl}`

  // Usar yt-dlp con argumentos avanzados anti-bloqueo para extraer metadatos y enlace m4a directo
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist', '--no-warnings', '-j',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      '--', targetUrl
    ]
    const p = spawn('yt-dlp', args)
    let out = '', err = ''
    
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Timeout extrayendo metadatos')) }, 25000)

    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('close', code => {
      clearTimeout(timer)
      if (code !== 0 && !out) return reject(new Error('No se pudo resolver el contenido de YouTube'))
      try {
        const info = JSON.parse(out.trim().split('\n')[0])
        const formats = info.formats || []
        // Buscar el mejor audio m4a (itag 140 o superior)
        const audioFormat = formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || info

        resolve({
          id: info.id,
          title: info.title || 'Audio de YouTube',
          channel: info.uploader || info.channel || 'Desconocido',
          views: info.view_count ? Number(info.view_count).toLocaleString() : 'No disponible',
          likes: info.like_count ? Number(info.like_count).toLocaleString() : 'No disponible',
          year: info.upload_date ? info.upload_date.slice(0, 4) : 'Desconocido',
          thumbnail: info.thumbnail || '',
          url: targetUrl,
          directAudioUrl: audioFormat.url || info.url
        })
      } catch (e) {
        reject(new Error('Error analizando metadatos del video'))
      }
    })
  })
}

// Descargar buffer m4a directamente en memoria sin usar almacenamiento de Render
async function downloadBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  if (!res.ok) throw new Error('Error al descargar el flujo de audio')
  const arrayBuffer = await res.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)
  if (buf.length > 40 * 1024 * 1024) throw new Error('El archivo supera el límite de 40MB')
  return buf
}

// Servidor API para stream directo web
module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname !== '/api/stream' && u.pathname !== '/api/audio') return false
  const q = u.searchParams.get('q') || u.searchParams.get('id')
  if (!q) { res.writeHead(400); res.end('Falta parámetro q'); return true }
  
  try {
    const meta = await getAudioMetadataAndStream(q)
    res.writeHead(200, { 'Content-Type': 'audio/mp4', 'Cache-Control': 'no-store' })
    const streamRes = await fetch(meta.directAudioUrl, { headers: { 'User-Agent': UA } })
    Readable.fromWeb(streamRes.body).pipe(res)
  } catch (e) {
    res.writeHead(500); res.end('Error en stream')
  }
  return true
}

module.exports.getAudioMetadataAndStream = getAudioMetadataAndStream
module.exports.downloadBuffer = downloadBuffer
