/**
 * Pure Plinko — static host + mock Stake RGS (/wallet/authenticate, /play, /end-round).
 * Usage: node server.mjs
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRgsRequest, handleReplayRequest } from './server/rgs-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5174;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jsonl': 'application/json',
  '.csv': 'text/csv',
  '.zst': 'application/octet-stream',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname.startsWith('/bet/replay/')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const game = parts[2];
    const version = parts[3];
    const mode = parts[4];
    const event = parts.slice(5).join('/');
    const result = handleReplayRequest(game, version, mode, decodeURIComponent(event), url.searchParams.get('amount'));
    const status = result.error ? (result.error.code === 'ERR_BNF' ? 404 : 400) : 200;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/wallet/')) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'ERR_VAL', message: 'Invalid JSON' } }));
        return;
      }

      const result = handleRgsRequest(url.pathname, parsed);
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'ERR_VAL', message: 'Not found' } }));
        return;
      }

      const status = result.error ? 400 : 200;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }

  let filePath = join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

server.listen(PORT, HOST, () => {
  console.log(`Pure Plinko + mock RGS listening on ${HOST}:${PORT}`);
  if (!process.env.PORT) {
    console.log(`Local: http://127.0.0.1:${PORT}/`);
  }
});
