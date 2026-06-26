import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Route: POST /api/simulate
  if (req.method === 'POST' && url.pathname === '/api/simulate') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const { prompt } = JSON.parse(body);
        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Falta el prompt en la petición' }));
          return;
        }

        // Ejecutar el harness CLI localmente y capturar la salida
        // Cwd se establece en la raíz del repositorio de Atlantis
        const repoRoot = path.join(__dirname, '..', '..');
        exec(`node integrations/antigravity/atlantis-harness-gemini.mjs "${prompt.replace(/"/g, '\\"')}"`, { cwd: repoRoot }, (error, stdout, stderr) => {
          // Leer el Engram después de la ejecución
          let engramContent = '';
          try {
            const engramPath = path.join(__dirname, 'engram', 'knowledge_base.md');
            if (fs.existsSync(engramPath)) {
              engramContent = fs.readFileSync(engramPath, 'utf8');
            }
          } catch (e) {
            console.error('Error al leer el Engram:', e);
          }

          let configContent = {};
          try {
            const configPath = path.join(__dirname, 'atlantis.config.json');
            if (fs.existsSync(configPath)) {
              configContent = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
          } catch (e) {
            console.error('Error al leer el config:', e);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: !error,
            log: stdout || stderr,
            engram: engramContent,
            config: configContent
          }));
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Route: GET /api/config
  if (req.method === 'GET' && url.pathname === '/api/config') {
    try {
      const configPath = path.join(__dirname, 'atlantis.config.json');
      const data = fs.readFileSync(configPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Route: GET /api/engram
  if (req.method === 'GET' && url.pathname === '/api/engram') {
    try {
      const engramPath = path.join(__dirname, 'engram', 'knowledge_base.md');
      const data = fs.readFileSync(engramPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static files server
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found</h1><p>El archivo solicitado no existe.</p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`🔱 Oficina Virtual de Atlantis activa en: http://localhost:${PORT}`);
});
