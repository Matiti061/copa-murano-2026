// Servidor estático mínimo para probar la app:  node tools/serve.js  →  http://localhost:5173
// (La app también funciona abriendo app/index.html directamente en el navegador.)
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'app');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(5173, '127.0.0.1', () => console.log('Copa Murano → http://localhost:5173'));
