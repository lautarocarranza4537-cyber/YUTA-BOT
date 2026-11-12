const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('YUTA-BOT is running smoothly!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`));
require('./index.js');
