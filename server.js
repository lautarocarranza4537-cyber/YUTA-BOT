const http = require('http')
const fs = require('fs')
const path = require('path')
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  const f = path.join(__dirname, p === '/' ? 'index.html' : p)
  if (!f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('No encontrado') }
  res.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
}).listen(process.env.PORT || 3000, () => console.log('YUTA Play en marcha'))
