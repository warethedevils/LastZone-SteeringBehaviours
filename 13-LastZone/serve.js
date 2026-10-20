// Mini serveur statique (aucune dépendance) : node serve.js  ->  http://localhost:8080
// Outil de développement : POST /__enregistrer/<nom> (depuis localhost uniquement) écrit un
// enregistrement vidéo .webm dans le dossier video/ (voir outils/video.js).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json',
  '.webm': 'video/webm', '.mp4': 'video/mp4'
};
const MAX_UPLOAD = 300 * 1024 * 1024;

function isLocal(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// Enregistre le corps de la requête dans video/<nom>.webm (nom restreint à [a-z0-9-])
function saveRecording(req, res) {
  const name = decodeURIComponent(req.url.split('/__enregistrer/')[1] || '').replace(/\?.*$/, '');
  if (!isLocal(req) || !/^[a-z0-9-]{1,60}\.webm$/.test(name)) { res.writeHead(403); return res.end('refusé'); }
  const dir = path.join(root, 'video');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const out = fs.createWriteStream(file);
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_UPLOAD) { req.destroy(); out.destroy(); fs.unlink(file, () => {}); }
  });
  req.pipe(out);
  out.on('finish', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ file: 'video/' + name, bytes: size })); });
  out.on('error', () => { res.writeHead(500); res.end('erreur'); });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__enregistrer/')) return saveRecording(req, res);
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('LAST ZONE sur http://localhost:' + port));
