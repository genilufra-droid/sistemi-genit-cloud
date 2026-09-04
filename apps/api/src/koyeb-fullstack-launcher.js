import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const originalCreateServer = http.createServer;
let capturedApp = null;
let deferredListen = null;

http.createServer = function captureFullstackApp(app, ...args) {
  capturedApp = app;
  const server = originalCreateServer.call(this, app, ...args);
  const originalListen = server.listen;
  server.listen = function deferFullstackListen(...listenArgs) {
    deferredListen = { server, originalListen, listenArgs };
    return server;
  };
  return server;
};

await import('./phase76-launcher.js');

http.createServer = originalCreateServer;

if (!capturedApp || !deferredListen) {
  throw new Error('Koyeb launcher nuk arriti të kapë Express app para nisjes së serverit.');
}

const publicDir = process.env.WEB_PUBLIC_DIR || fileURLToPath(new URL('../public/', import.meta.url));
const indexPath = path.join(publicDir, 'index.html');

function requestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'https';
  const host = forwardedHost || req.headers.host;
  return host ? `${proto}://${host}` : '';
}

function installFrontendFallback(app) {
  if (!fs.existsSync(indexPath)) {
    console.warn(`Koyeb fullstack: frontend index.html nuk u gjet te ${indexPath}. API do të punojë pa frontend.`);
    return;
  }

  const router = app.router || app._router;
  const terminalLayers = router?.stack?.length >= 2 ? router.stack.splice(-2) : [];

  app.use('/assets', express.static(path.join(publicDir, 'assets'), { maxAge: '1d', fallthrough: true }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    try {
      const origin = requestOrigin(req);
      let html = fs.readFileSync(indexPath, 'utf8');
      if (origin) {
        html = html.replace(/"apiUrl"\s*:\s*"__SELF__"/, `"apiUrl":${JSON.stringify(origin)}`);
      }
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  });

  if (terminalLayers.length && router?.stack) router.stack.push(...terminalLayers);
  console.log(`Koyeb fullstack: frontend u lidh nga ${publicDir}`);
}

installFrontendFallback(capturedApp);

deferredListen.server.listen = deferredListen.originalListen;
deferredListen.originalListen.apply(deferredListen.server, deferredListen.listenArgs);
