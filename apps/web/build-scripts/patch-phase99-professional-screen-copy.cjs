'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const sourcePath = path.join(root, 'phase99-professional-screen-copy.js');
const marker = 'SG_PHASE99_PROFESSIONAL_SCREEN_COPY_START';
if (!fs.existsSync(indexPath)) throw new Error('Mungon index.html');
if (!fs.existsSync(sourcePath)) throw new Error('Mungon phase99-professional-screen-copy.js');
let html = fs.readFileSync(indexPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8');
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, function (block) {
  return block.includes(marker) ? '' : block;
});
html += '\n<script>\n' + source + '\n</script>\n';
if (html.lastIndexOf(marker) < 0) throw new Error('Phase 9.9 nuk u injektua');
fs.writeFileSync(indexPath, html);
