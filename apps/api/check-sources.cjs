'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const sourceRoot = path.join(__dirname, 'src');
const extensions = new Set(['.js', '.cjs', '.mjs']);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return extensions.has(path.extname(entry.name)) ? [target] : [];
  });
}

const files = sourceFiles(sourceRoot).sort();
if (!files.length) throw new Error(`Nuk u gjetën skedarë JavaScript në ${sourceRoot}.`);

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`API source check passed: ${files.length}/${files.length} files.`);
