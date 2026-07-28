import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARCHIVE_MAX_FILE_SIZE,
  decodeArchiveUpload,
} from '../apps/api/src/phase84-electronic-archive.js';

const base = {
  companyId: '11111111-1111-4111-8111-111111111111',
  documentKey: 'document:purchase-invoice-1',
  documentTitle: 'Faturë Blerjeje',
  documentNo: 'FB-2026-00001',
  filename: 'fatura.pdf',
  mimeType: 'application/pdf',
  notes: 'Origjinali',
};

const decoded = decodeArchiveUpload({
  ...base,
  contentBase64: Buffer.from('%PDF-1.7 real document').toString('base64'),
});
assert.equal(decoded.content.toString(), '%PDF-1.7 real document');
assert.equal(decoded.fileSize, 22);
assert.match(decoded.checksum, /^[a-f0-9]{64}$/);

assert.throws(
  () => decodeArchiveUpload({ ...base, filename: 'virus.exe', mimeType: 'application/octet-stream', contentBase64: 'YQ==' }),
  /Lejohen vetëm foto, PDF dhe ZIP/,
);
assert.throws(
  () => decodeArchiveUpload({ ...base, contentBase64: Buffer.alloc(ARCHIVE_MAX_FILE_SIZE + 1).toString('base64') }),
  /25 MB/,
);

const api = fs.readFileSync(new URL('../apps/api/src/phase84-electronic-archive.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../apps/web/phase84-electronic-archive.js', import.meta.url), 'utf8');
const build = fs.readFileSync(new URL('../apps/web/build-self-contained.cjs', import.meta.url), 'utf8');

for (const marker of [
  'electronic_archive_files', 'tenant_id', 'company_id', 'checksum_sha256',
  'electronic_archive_folders', '/api/archive/folders', 'ARCHIVE_FOLDER_CREATE',
  'assertCompanyAccess', 'ARCHIVE_FILE_UPLOAD', 'ARCHIVE_FILE_DELETE',
  '/api/archive/files/:id/content',
]) assert.ok(api.includes(marker), `Mungon kontrata API: ${marker}`);

for (const marker of [
  'Arkiva Elektronike', 'Bashkëngjit Skedar', 'Kërko në Arkivë',
  '/api/archive/files', '/api/archive/folders', 'sg_cloud_access_token_v1', 'MAX_FILE_SIZE',
  'view_electronicArchive', 'Dosje e Re', 'Ngarko PDF / Foto / ZIP', 'Zhvendos',
]) assert.ok(ui.includes(marker), `Mungon kontrata UI: ${marker}`);

assert.ok(build.includes("'patch-phase84-electronic-archive.cjs'"), 'Arkiva cloud nuk është aktive në build.');
assert.ok(!ui.includes('indexedDB'), 'Arkiva nuk duhet të ruajë skedarë vetëm në pajisjen lokale.');

console.log('ELECTRONIC_ARCHIVE_CONTRACT_SUCCESS cloud=true maxMB=25');
