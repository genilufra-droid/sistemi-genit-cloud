import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(webDir, '../..');
const localSourceDir = path.join(webDir, 'html64-source');
const rootSourceDir = path.join(repoDir, 'html64-source');
const sourceDir = fs.existsSync(localSourceDir) ? localSourceDir : rootSourceDir;
const distDir = path.join(webDir, 'dist');
const packedPath = path.join(webDir, '.sistemi-genit-html64.xz');
const outputPath = path.join(distDir, 'index.html');

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Mungon dosja e burimit HTML 6.4: ${sourceDir}`);
}

const parts = fs.readdirSync(sourceDir)
  .filter((name) => /^xz-\d+\.b64$/.test(name))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

if (parts.length !== 8) {
  throw new Error(`Burimi HTML 6.4 është i paplotë: u gjetën ${parts.length}/8 pjesë.`);
}

const base64 = parts
  .map((name) => fs.readFileSync(path.join(sourceDir, name), 'utf8'))
  .join('')
  .replace(/\s+/g, '');

fs.writeFileSync(packedPath, Buffer.from(base64, 'base64'));
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

function decompressWith(command, args) {
  return spawnSync(command, args, {
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
}

let result = decompressWith('xz', ['-dc', packedPath]);
if (result.error || result.status !== 0) {
  result = decompressWith('python3', [
    '-c',
    'import lzma,sys;sys.stdout.buffer.write(lzma.open(sys.argv[1],"rb").read())',
    packedPath,
  ]);
}

fs.rmSync(packedPath, { force: true });

if (result.error) {
  throw new Error(`Dekompresimi nuk u ekzekutua: ${result.error.message}`);
}
if (result.status !== 0) {
  throw new Error(`Dekompresimi dështoi: ${String(result.stderr || '')}`);
}

const html = result.stdout;
if (!html || html.length < 1_000_000) {
  throw new Error(`HTML i rindërtuar është i paplotë (${html?.length || 0} bytes).`);
}

const textStart = html.subarray(0, 400).toString('utf8').toLowerCase();
if (!textStart.includes('<!doctype html')) {
  throw new Error('Burimi i rindërtuar nuk fillon me DOCTYPE HTML.');
}

fs.writeFileSync(outputPath, html);
console.log(`Sistemi Genit HTML 6.4 u rindërtua: ${html.length} bytes`);
