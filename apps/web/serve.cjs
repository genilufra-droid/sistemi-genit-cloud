'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4173);
const DIST_DIR = path.resolve(__dirname, 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeFilePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relativePath = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(DIST_DIR, relativePath || 'index.html');
  if (candidate !== DIST_DIR && !candidate.startsWith(`${DIST_DIR}${path.sep}`)) return null;
  return candidate;
}

function serveFile(req, res, filePath, fallbackToIndex = true) {
  fs.stat(filePath, (statError, stats) => {
    if (!statError && stats.isDirectory()) {
      return serveFile(req, res, path.join(filePath, 'index.html'), fallbackToIndex);
    }

    if (statError || !stats.isFile()) {
      if (fallbackToIndex && path.extname(filePath) === '') {
        return serveFile(req, res, INDEX_FILE, false);
      }
      return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Skedari nuk u gjet.' });
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    const isHtml = extension === '.html';
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
    };

    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      if (!res.headersSent) sendJson(res, 500, { error: 'READ_FAILED', message: error.message });
      else res.destroy(error);
    });
    stream.pipe(res);
  });
}

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`PORT i pavlefshëm: ${process.env.PORT}`);
}
if (!fs.existsSync(INDEX_FILE)) {
  throw new Error('Mungon apps/web/dist/index.html. Ekzekutoni npm run build para nisjes.');
}

const server = http.createServer((req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'BAD_REQUEST', message: 'URL mungon.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Lejohen vetëm GET dhe HEAD.' });
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/healthz' || url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', service: 'Sistemi Genit Web', time: new Date().toISOString() });
  }

  const filePath = safeFilePath(url.pathname);
  if (!filePath) return sendJson(res, 400, { error: 'INVALID_PATH', message: 'Rruga është e pavlefshme.' });
  serveFile(req, res, filePath, true);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(PORT, HOST, () => {
  console.log(`Sistemi Genit Web listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal}: duke mbyllur serverin web...`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
