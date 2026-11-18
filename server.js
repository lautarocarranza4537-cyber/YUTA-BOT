const http = require('http')
const fs = require('fs')
const path = require('path')
const api = require('./api')
const wa = require('./wa')
const play = require('./play')

process.on('unhandledRejection', e => console.error('unhandledRejection:', e))
process.on('uncaughtException', e => console.error('uncaughtException:', e))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
}

http.createServer(async (req, res) => {
  try {
    if (await wa.http(req, res)) return
    if (await play(req, res)) return
    if (await api(req, res)) return

    let file = path.join(__dirname, req.url.split('?')[0] === '/' ? 'index.html' : req.url)
    const ext = path.extname(file)
    const type = MIME[ext] || 'application/octet-stream'

    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
      fs.createReadStream(file).pipe(res)
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('404 Not Found')
    }
  } catch (e) {
    if (!res.headersSent) { res.writeHead(500); res.end('Server Error') }
  }
}).listen(process.env.PORT || 3000, () => console.log('🔥 [YUTA MASTER] Servidor activo en puerto 3000'))
