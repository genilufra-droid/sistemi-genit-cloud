import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = [
  'SUPER_ADMIN', 'COMPANY_ADMIN', 'MANAGER', 'FINANCIER',
  'MAGAZINIER', 'OPERATOR_PESHORE', 'SHITES', 'ARKETAR',
];
export const ARCHIVE_MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME = /^(image\/(?:jpeg|png|webp|gif)|application\/(?:pdf|zip|x-zip-compressed))$/i;

const uploadSchema = z.object({
  companyId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional().default(null),
  documentKey: z.string().trim().min(1).max(900),
  documentTitle: z.string().trim().max(240).optional().default(''),
  documentNo: z.string().trim().max(120).optional().default(''),
  filename: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(120),
  contentBase64: z.string().min(1),
  notes: z.string().trim().max(2000).optional().default(''),
});

const updateSchema = z.object({
  filename: z.string().trim().min(1).max(240).optional(),
  notes: z.string().trim().max(2000).optional(),
  folderId: z.string().uuid().nullable().optional(),
}).refine((value) => value.filename !== undefined || value.notes !== undefined || value.folderId !== undefined, {
  message: 'Nuk ka ndryshime për t’u ruajtur.',
});

const folderSchema = z.object({
  companyId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional().default(null),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().default(''),
});

const folderUpdateSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Nuk ka ndryshime për t’u ruajtur.' });

function cleanFilename(value) {
  return String(value || '').replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 240);
}

export function decodeArchiveUpload(input) {
  const parsed = uploadSchema.parse(input);
  if (!ALLOWED_MIME.test(parsed.mimeType) && !parsed.filename.toLowerCase().endsWith('.zip')) {
    const error = new Error('Lejohen vetëm foto, PDF dhe ZIP.');
    error.status = 415;
    throw error;
  }
  const normalized = parsed.contentBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    const error = new Error('Përmbajtja Base64 nuk është e vlefshme.');
    error.status = 400;
    throw error;
  }
  const content = Buffer.from(normalized, 'base64');
  if (!content.length) {
    const error = new Error('Skedari është bosh.');
    error.status = 400;
    throw error;
  }
  if (content.length > ARCHIVE_MAX_FILE_SIZE) {
    const error = new Error('Skedari kalon kufirin 25 MB.');
    error.status = 413;
    throw error;
  }
  return {
    ...parsed,
    filename: cleanFilename(parsed.filename),
    content,
    fileSize: content.length,
    checksum: createHash('sha256').update(content).digest('hex'),
  };
}

export async function migrateElectronicArchive(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS electronic_archive_folders (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES electronic_archive_folders(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_electronic_archive_folder_name
      ON electronic_archive_folders(tenant_id, company_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(name));
    CREATE INDEX IF NOT EXISTS idx_electronic_archive_folders
      ON electronic_archive_folders(tenant_id, company_id, parent_id, name);
    CREATE TABLE IF NOT EXISTS electronic_archive_files (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      folder_id UUID REFERENCES electronic_archive_folders(id) ON DELETE RESTRICT,
      document_key VARCHAR(900) NOT NULL,
      document_title VARCHAR(240),
      document_no VARCHAR(120),
      filename VARCHAR(240) NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= ${ARCHIVE_MAX_FILE_SIZE}),
      checksum_sha256 CHAR(64) NOT NULL,
      content BYTEA NOT NULL,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, company_id, document_key, checksum_sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_electronic_archive_document
      ON electronic_archive_files(tenant_id, company_id, document_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_electronic_archive_search
      ON electronic_archive_files(tenant_id, company_id, created_at DESC);
    ALTER TABLE electronic_archive_files
      ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES electronic_archive_folders(id) ON DELETE RESTRICT;
    CREATE INDEX IF NOT EXISTS idx_electronic_archive_folder_files
      ON electronic_archive_files(tenant_id, company_id, folder_id, created_at DESC);
  `);
}

function publicRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    folderId: row.folder_id || null,
    folderName: row.folder_name || '',
    documentKey: row.document_key,
    documentTitle: row.document_title || '',
    documentNo: row.document_no || '',
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    checksum: row.checksum_sha256,
    notes: row.notes || '',
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicFolder(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    parentId: row.parent_id || null,
    name: row.name,
    description: row.description || '',
    fileCount: Number(row.file_count || 0),
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findAccessibleFolder(pool, req, id, assertCompanyAccess) {
  const { rows } = await pool.query(
    `SELECT f.*,u.full_name AS created_by_name
       FROM electronic_archive_folders f
       LEFT JOIN users u ON u.id=f.created_by
      WHERE f.id=$1 AND f.tenant_id=$2`,
    [id, req.user.tenant_id],
  );
  const row = rows[0];
  if (!row) {
    const error = new Error('Dosja elektronike nuk u gjet.');
    error.status = 404;
    throw error;
  }
  await assertCompanyAccess(req.user, row.company_id);
  return row;
}

async function assertFolderForCompany(pool, req, folderId, companyId, assertCompanyAccess) {
  if (!folderId) return null;
  const folder = await findAccessibleFolder(pool, req, folderId, assertCompanyAccess);
  if (folder.company_id !== companyId) {
    const error = new Error('Dosja nuk i përket kompanisë aktive.');
    error.status = 409;
    throw error;
  }
  return folder;
}

async function findAccessibleFile(pool, req, id, assertCompanyAccess) {
  const { rows } = await pool.query(
    `SELECT f.*,u.full_name AS created_by_name
       FROM electronic_archive_files f
       LEFT JOIN users u ON u.id=f.created_by
      WHERE f.id=$1 AND f.tenant_id=$2`,
    [id, req.user.tenant_id],
  );
  const row = rows[0];
  if (!row) {
    const error = new Error('Skedari nuk u gjet.');
    error.status = 404;
    throw error;
  }
  await assertCompanyAccess(req.user, row.company_id);
  return row;
}

export function installElectronicArchiveRoutes({
  app, pool, authRequired, requireRoles, assertCompanyAccess, audit,
}) {
  app.get('/api/archive/folders', authRequired, async (req, res, next) => {
    try {
      const companyId = String(req.query.companyId || '');
      await assertCompanyAccess(req.user, companyId);
      const { rows } = await pool.query(
        `SELECT f.*,u.full_name AS created_by_name,COUNT(af.id)::int AS file_count
           FROM electronic_archive_folders f
           LEFT JOIN users u ON u.id=f.created_by
           LEFT JOIN electronic_archive_files af ON af.folder_id=f.id
          WHERE f.tenant_id=$1 AND f.company_id=$2
          GROUP BY f.id,u.full_name ORDER BY f.name`,
        [req.user.tenant_id, companyId],
      );
      res.json(rows.map(publicFolder));
    } catch (error) { next(error); }
  });

  app.post('/api/archive/folders', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const input = folderSchema.parse(req.body);
      await assertCompanyAccess(req.user, input.companyId);
      await assertFolderForCompany(pool, req, input.parentId, input.companyId, assertCompanyAccess);
      const id = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO electronic_archive_folders
          (id,tenant_id,company_id,parent_id,name,description,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [id, req.user.tenant_id, input.companyId, input.parentId, input.name, input.description || null, req.user.id],
      );
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'ARCHIVE_FOLDER_CREATE',
        entityType:'electronic_archive_folder',entityId:id,companyId:input.companyId,
        metadata:{name:input.name,parentId:input.parentId},ip:req.ip,
      });
      res.status(201).json(publicFolder({ ...rows[0], created_by_name:req.user.full_name, file_count:0 }));
    } catch (error) {
      if (error?.code === '23505') {
        error.status = 409;
        error.message = 'Ekziston tashmë një dosje me këtë emër në këtë nivel.';
      }
      next(error);
    }
  });

  app.patch('/api/archive/folders/:id', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const current = await findAccessibleFolder(pool, req, req.params.id, assertCompanyAccess);
      const input = folderUpdateSchema.parse(req.body);
      const parentId = input.parentId === undefined ? current.parent_id : input.parentId;
      if (parentId === current.id) {
        const error = new Error('Dosja nuk mund të vendoset brenda vetes.');
        error.status = 409;
        throw error;
      }
      await assertFolderForCompany(pool, req, parentId, current.company_id, assertCompanyAccess);
      const name = input.name === undefined ? current.name : input.name;
      const description = input.description === undefined ? current.description : input.description;
      const { rows } = await pool.query(
        `UPDATE electronic_archive_folders
            SET parent_id=$1,name=$2,description=$3,updated_at=NOW()
          WHERE id=$4 AND tenant_id=$5 RETURNING *`,
        [parentId, name, description || null, current.id, req.user.tenant_id],
      );
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'ARCHIVE_FOLDER_UPDATE',
        entityType:'electronic_archive_folder',entityId:current.id,companyId:current.company_id,
        metadata:{name,parentId},ip:req.ip,
      });
      res.json(publicFolder(rows[0]));
    } catch (error) { next(error); }
  });

  app.delete('/api/archive/folders/:id', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const current = await findAccessibleFolder(pool, req, req.params.id, assertCompanyAccess);
      const { rows } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM electronic_archive_files WHERE folder_id=$1) AS files,
           (SELECT COUNT(*) FROM electronic_archive_folders WHERE parent_id=$1) AS children`,
        [current.id],
      );
      if (Number(rows[0].files) || Number(rows[0].children)) {
        const error = new Error('Dosja nuk është bosh. Zhvendos ose fshi përmbajtjen më parë.');
        error.status = 409;
        throw error;
      }
      await pool.query('DELETE FROM electronic_archive_folders WHERE id=$1 AND tenant_id=$2', [current.id, req.user.tenant_id]);
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'ARCHIVE_FOLDER_DELETE',
        entityType:'electronic_archive_folder',entityId:current.id,companyId:current.company_id,
        metadata:{name:current.name},ip:req.ip,
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/archive/files', authRequired, async (req, res, next) => {
    try {
      const companyId = String(req.query.companyId || '');
      await assertCompanyAccess(req.user, companyId);
      const documentKey = String(req.query.documentKey || '').trim();
      const folderId = String(req.query.folderId || '').trim();
      const query = String(req.query.query || '').trim().slice(0, 160);
      const params = [req.user.tenant_id, companyId];
      let where = 'f.tenant_id=$1 AND f.company_id=$2';
      if (documentKey) {
        params.push(documentKey);
        where += ` AND f.document_key=$${params.length}`;
      }
      if (folderId) {
        params.push(folderId);
        where += ` AND f.folder_id=$${params.length}`;
      }
      if (query) {
        params.push(`%${query}%`);
        where += ` AND (f.filename ILIKE $${params.length} OR f.document_no ILIKE $${params.length} OR f.document_title ILIKE $${params.length} OR f.notes ILIKE $${params.length})`;
      }
      const { rows } = await pool.query(
        `SELECT f.id,f.company_id,f.folder_id,fo.name AS folder_name,f.document_key,f.document_title,f.document_no,
                f.filename,f.mime_type,f.file_size,f.checksum_sha256,f.notes,
                f.created_by,f.created_at,f.updated_at,u.full_name AS created_by_name
           FROM electronic_archive_files f
           LEFT JOIN users u ON u.id=f.created_by
           LEFT JOIN electronic_archive_folders fo ON fo.id=f.folder_id
          WHERE ${where}
          ORDER BY f.created_at DESC LIMIT 500`,
        params,
      );
      res.json(rows.map(publicRow));
    } catch (error) { next(error); }
  });

  app.post('/api/archive/files', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const input = decodeArchiveUpload(req.body);
      await assertCompanyAccess(req.user, input.companyId);
      await assertFolderForCompany(pool, req, input.folderId, input.companyId, assertCompanyAccess);
      const id = randomUUID();
      const { rows } = await pool.query(
        `INSERT INTO electronic_archive_files
          (id,tenant_id,company_id,folder_id,document_key,document_title,document_no,filename,
           mime_type,file_size,checksum_sha256,content,notes,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id,company_id,folder_id,document_key,document_title,document_no,filename,
                   mime_type,file_size,checksum_sha256,notes,created_by,created_at,updated_at`,
        [id, req.user.tenant_id, input.companyId, input.folderId, input.documentKey,
          input.documentTitle || null, input.documentNo || null, input.filename,
          input.mimeType, input.fileSize, input.checksum, input.content,
          input.notes || null, req.user.id],
      );
      await audit({
        tenantId: req.user.tenant_id, userId: req.user.id,
        action: 'ARCHIVE_FILE_UPLOAD', entityType: 'electronic_archive_file',
        entityId: id, companyId: input.companyId,
        metadata: {
          documentKey: input.documentKey, documentNo: input.documentNo,
          filename: input.filename, mimeType: input.mimeType,
          fileSize: input.fileSize, checksum: input.checksum,
        }, ip: req.ip,
      });
      res.status(201).json(publicRow({ ...rows[0], created_by_name: req.user.full_name }));
    } catch (error) {
      if (error?.code === '23505') {
        error.status = 409;
        error.message = 'Ky skedar është bashkëngjitur më parë te ky dokument.';
      }
      next(error);
    }
  });

  app.get('/api/archive/files/:id/content', authRequired, async (req, res, next) => {
    try {
      const row = await findAccessibleFile(pool, req, req.params.id, assertCompanyAccess);
      res.setHeader('Content-Type', row.mime_type);
      res.setHeader('Content-Length', String(row.file_size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `${/^(image\/|application\/pdf$)/i.test(row.mime_type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
      res.send(row.content);
    } catch (error) { next(error); }
  });

  app.patch('/api/archive/files/:id', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const current = await findAccessibleFile(pool, req, req.params.id, assertCompanyAccess);
      const input = updateSchema.parse(req.body);
      const filename = input.filename === undefined ? current.filename : cleanFilename(input.filename);
      const notes = input.notes === undefined ? current.notes : input.notes;
      const folderId = input.folderId === undefined ? current.folder_id : input.folderId;
      await assertFolderForCompany(pool, req, folderId, current.company_id, assertCompanyAccess);
      const { rows } = await pool.query(
        `UPDATE electronic_archive_files
            SET filename=$1,notes=$2,folder_id=$3,updated_at=NOW()
          WHERE id=$4 AND tenant_id=$5 RETURNING *`,
        [filename, notes || null, folderId, current.id, req.user.tenant_id],
      );
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'ARCHIVE_FILE_UPDATE',
        entityType:'electronic_archive_file',entityId:current.id,companyId:current.company_id,
        metadata:{before:{filename:current.filename,notes:current.notes,folderId:current.folder_id},after:{filename,notes,folderId}},ip:req.ip,
      });
      res.json(publicRow(rows[0]));
    } catch (error) { next(error); }
  });

  app.delete('/api/archive/files/:id', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const current = await findAccessibleFile(pool, req, req.params.id, assertCompanyAccess);
      await pool.query('DELETE FROM electronic_archive_files WHERE id=$1 AND tenant_id=$2', [current.id, req.user.tenant_id]);
      await audit({
        tenantId:req.user.tenant_id,userId:req.user.id,action:'ARCHIVE_FILE_DELETE',
        entityType:'electronic_archive_file',entityId:current.id,companyId:current.company_id,
        metadata:{documentKey:current.document_key,documentNo:current.document_no,filename:current.filename,fileSize:current.file_size,checksum:current.checksum_sha256},ip:req.ip,
      });
      res.status(204).end();
    } catch (error) { next(error); }
  });
}
