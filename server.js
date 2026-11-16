const http = require('http')
const fs = require('fs')
const path = require('path')
const api = require('./api')
const wa = require('./wa')
const play = require('./play')

process.on('unhandledRejection', e => console.error('unhandledRejection:', e))
process.on('uncaughtException', e => console.error('uncaughtException:', e))

const FILES = {
  'index.html': 'text/html; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8'
}

http.createServer(async (req, res) => {
  try {
    if (await wa.http(req, res)) return
    if (await play(req, res)) return
    if (await api(req, res)) return
    const p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'
    const type = FILES[p]
    const file = path.join(__dirname, p)
    if (!type || !fs.existsSync(file)) { res.writeHead(404); return res.end('No encontrado') }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
    fs.createReadStream(file).pipe(res)
  } catch (e) {
    if (!res.headersSent) { res.writeHead(500); res.end('Error') }
  }
}).listen(process.env.PORT || 3000, () => console.log('YUTA Play v3 en marcha'))
