import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','ARKETAR'];
const ACCOUNT_KINDS = ['CASH','BANK'];
const DOCUMENT_TYPES = ['CASH_RECEIPT','CASH_PAYMENT','BANK_RECEIPT','BANK_PAYMENT'];
const STATUS = ['DRAFT','POSTED','CANCELLED'];
const num = (value) => Number(value || 0);
const text = (value) => String(value ?? '').trim();

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function dateOnly(value) { return String(value || new Date().toISOString()).slice(0, 10); }
function signFor(type) { return /RECEIPT$/.test(type) ? 1 : -1; }
function kindFor(type) { return type.startsWith('CASH_') ? 'CASH' : 'BANK'; }

async function addChange(client, user, companyId, entityType, entityId, operation, metadata = {}) {
  await client.query(
    `INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [user.tenant_id, companyId, entityType, entityId, operation, JSON.stringify(metadata), user.id],
  );
}

async function nextNumber(client, tenantId, companyId, key, prefix, documentDate) {
  const year = dateOnly(documentDate).slice(0, 4);
  const sequenceKey = `${key}-${year}`;
  const { rows } = await client.query(
    `INSERT INTO finance_sequences(tenant_id,company_id,sequence_key,last_value)
     VALUES($1,$2,$3,1)
     ON CONFLICT(tenant_id,company_id,sequence_key)
     DO UPDATE SET last_value=finance_sequences.last_value+1,updated_at=NOW()
     RETURNING last_value`,
    [tenantId, companyId, sequenceKey],
  );
  return `${prefix}-${year}-${String(rows[0].last_value).padStart(6, '0')}`;
}

async function getAccountForUpdate(client, user, accountId) {
  const { rows } = await client.query(
    `SELECT * FROM finance_accounts WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
    [accountId, user.tenant_id],
  );
  const account = rows[0];
  if (!account) throw requestError('Llogaria financiare nuk u gjet.', 404);
  return account;
}

async function getDocumentForUpdate(client, user, documentId) {
  const { rows } = await client.query(
    `SELECT * FROM finance_documents WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,
    [documentId, user.tenant_id],
  );
  const document = rows[0];
  if (!document) throw requestError('Dokumenti financiar nuk u gjet.', 404);
  return document;
}

async function computeAccountBalance(client, accountId) {
  const { rows } = await client.query(
    `SELECT a.opening_balance + COALESCE(SUM(CASE
       WHEN d.status='POSTED' AND d.document_type IN ('CASH_RECEIPT','BANK_RECEIPT') THEN d.amount_base
       WHEN d.status='POSTED' AND d.document_type IN ('CASH_PAYMENT','BANK_PAYMENT') THEN -d.amount_base
       ELSE 0 END),0) AS balance
     FROM finance_accounts a
     LEFT JOIN finance_documents d ON d.account_id=a.id
     WHERE a.id=$1 GROUP BY a.id,a.opening_balance`,
    [accountId],
  );
  return num(rows[0]?.balance);
}

async function refreshInvoicePayment(client, businessDocumentId) {
  if (!businessDocumentId) return;
  const { rows } = await client.query(
    `SELECT d.total_amount,
       COALESCE(SUM(CASE WHEN f.status='POSTED' THEN pa.amount ELSE 0 END),0)::numeric AS paid
     FROM business_documents d
     LEFT JOIN payment_allocations pa ON pa.business_document_id=d.id
     LEFT JOIN finance_documents f ON f.id=pa.finance_document_id
     WHERE d.id=$1 GROUP BY d.id,d.total_amount`,
    [businessDocumentId],
  );
  if (!rows[0]) return;
  const total = num(rows[0].total_amount);
  const paid = Math.max(0, num(rows[0].paid));
  const remaining = Math.max(0, total - paid);
  const paymentStatus = paid <= 0 ? 'UNPAID' : remaining <= 0.0001 ? 'PAID' : 'PARTIAL';
  await client.query(
    `UPDATE business_documents SET paid_amount=$1,remaining_amount=$2,payment_status=$3,updated_at=NOW() WHERE id=$4`,
    [paid, remaining, paymentStatus, businessDocumentId],
  );
}

export async function migratePhase5Finance(db) {
  await db.query(`
    ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18,4) NOT NULL DEFAULT 0;
    ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(18,4) NOT NULL DEFAULT 0;
    ALTER TABLE business_documents ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID';
    UPDATE business_documents SET remaining_amount=GREATEST(total_amount-paid_amount,0),
      payment_status=CASE WHEN paid_amount<=0 THEN 'UNPAID' WHEN paid_amount>=total_amount THEN 'PAID' ELSE 'PARTIAL' END;

    CREATE TABLE IF NOT EXISTS finance_sequences (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sequence_key VARCHAR(100) NOT NULL,
      last_value BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(tenant_id,company_id,sequence_key)
    );

    CREATE TABLE IF NOT EXISTS finance_accounts (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
      account_kind VARCHAR(10) NOT NULL CHECK(account_kind IN ('CASH','BANK')),
      code VARCHAR(60) NOT NULL,
      name VARCHAR(180) NOT NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'ALL',
      opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
      opening_date DATE NOT NULL DEFAULT CURRENT_DATE,
      responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      bank_name VARCHAR(180),
      iban VARCHAR(100),
      account_number VARCHAR(100),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,account_kind,code)
    );

    CREATE TABLE IF NOT EXISTS finance_documents (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
      partner_id UUID REFERENCES business_partners(id) ON DELETE SET NULL,
      document_type VARCHAR(30) NOT NULL CHECK(document_type IN ('CASH_RECEIPT','CASH_PAYMENT','BANK_RECEIPT','BANK_PAYMENT')),
      document_no VARCHAR(80) NOT NULL,
      document_date DATE NOT NULL DEFAULT CURRENT_DATE,
      value_date DATE,
      currency VARCHAR(8) NOT NULL DEFAULT 'ALL',
      amount NUMERIC(18,4) NOT NULL CHECK(amount>0),
      exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1 CHECK(exchange_rate>0),
      amount_base NUMERIC(18,4) NOT NULL CHECK(amount_base>0),
      description TEXT NOT NULL,
      reference_no VARCHAR(160),
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','CANCELLED')),
      reconciled BOOLEAN NOT NULL DEFAULT FALSE,
      reconciliation_ref VARCHAR(160),
      version BIGINT NOT NULL DEFAULT 1,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
      cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
      posted_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,company_id,document_type,document_no)
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      finance_document_id UUID NOT NULL REFERENCES finance_documents(id) ON DELETE CASCADE,
      business_document_id UUID NOT NULL REFERENCES business_documents(id) ON DELETE RESTRICT,
      amount NUMERIC(18,4) NOT NULL CHECK(amount>0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(finance_document_id,business_document_id)
    );

    CREATE TABLE IF NOT EXISTS cash_daily_closings (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
      closing_date DATE NOT NULL,
      system_balance NUMERIC(18,4) NOT NULL,
      physical_balance NUMERIC(18,4) NOT NULL,
      difference NUMERIC(18,4) NOT NULL,
      denominations JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id,account_id,closing_date)
    );

    CREATE INDEX IF NOT EXISTS idx_finance_accounts_scope ON finance_accounts(tenant_id,company_id,account_kind,active);
    CREATE INDEX IF NOT EXISTS idx_finance_documents_scope ON finance_documents(tenant_id,company_id,document_date DESC,status);
    CREATE INDEX IF NOT EXISTS idx_finance_documents_account ON finance_documents(account_id,document_date DESC,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_allocations_document ON payment_allocations(business_document_id);
    CREATE INDEX IF NOT EXISTS idx_cash_closings_account ON cash_daily_closings(account_id,closing_date DESC);
  `);
}

const accountSchema = z.object({
  companyId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  accountKind: z.enum(ACCOUNT_KINDS),
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(180),
  currency: z.string().trim().min(3).max(8).default('ALL'),
  openingBalance: z.coerce.number().default(0),
  openingDate: z.string().date(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  bankName: z.string().trim().max(180).optional().default(''),
  iban: z.string().trim().max(100).optional().default(''),
  accountNumber: z.string().trim().max(100).optional().default(''),
  active: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().default(''),
});

const allocationSchema = z.object({
  businessDocumentId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

const documentSchema = z.object({
  companyId: z.string().uuid(),
  accountId: z.string().uuid(),
  partnerId: z.string().uuid().nullable().optional(),
  documentType: z.enum(DOCUMENT_TYPES),
  documentNo: z.string().trim().max(80).optional().default(''),
  documentDate: z.string().date(),
  valueDate: z.string().date().nullable().optional(),
  currency: z.string().trim().min(3).max(8).default('ALL'),
  amount: z.coerce.number().positive(),
  exchangeRate: z.coerce.number().positive().default(1),
  description: z.string().trim().min(2).max(2000),
  referenceNo: z.string().trim().max(160).optional().default(''),
  allocations: z.array(allocationSchema).default([]),
});

function accountSelectSql() {
  return `SELECT a.*,c.name AS company_name,w.name AS warehouse_name,u.full_name AS responsible_user_name,
    a.opening_balance + COALESCE(SUM(CASE
      WHEN d.status='POSTED' AND d.document_type IN ('CASH_RECEIPT','BANK_RECEIPT') THEN d.amount_base
      WHEN d.status='POSTED' AND d.document_type IN ('CASH_PAYMENT','BANK_PAYMENT') THEN -d.amount_base ELSE 0 END),0)::numeric AS balance
    FROM finance_accounts a
    JOIN companies c ON c.id=a.company_id
    LEFT JOIN warehouses w ON w.id=a.warehouse_id
    LEFT JOIN users u ON u.id=a.responsible_user_id
    LEFT JOIN finance_documents d ON d.account_id=a.id`;
}

function documentSelectSql() {
  return `SELECT d.*,a.code AS account_code,a.name AS account_name,a.account_kind,
    p.name AS partner_name,p.nipt AS partner_nipt,c.name AS company_name,
    COALESCE(jsonb_agg(jsonb_build_object('id',pa.id,'business_document_id',pa.business_document_id,
      'amount',pa.amount,'document_no',bd.document_no,'doc_type',bd.doc_type,'total_amount',bd.total_amount,
      'paid_amount',bd.paid_amount,'remaining_amount',bd.remaining_amount,'payment_status',bd.payment_status))
      FILTER(WHERE pa.id IS NOT NULL),'[]'::jsonb) AS allocations
    FROM finance_documents d
    JOIN finance_accounts a ON a.id=d.account_id
    JOIN companies c ON c.id=d.company_id
    LEFT JOIN business_partners p ON p.id=d.partner_id
    LEFT JOIN payment_allocations pa ON pa.finance_document_id=d.id
    LEFT JOIN business_documents bd ON bd.id=pa.business_document_id`;
}

export function installPhase5FinanceRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  app.get('/api/finance/accounts', authRequired, async (req, res, next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const kind = req.query.kind ? z.enum(ACCOUNT_KINDS).parse(req.query.kind) : null;
      const params = [req.user.tenant_id, companyIds];
      const kindWhere = kind ? ' AND a.account_kind=$3' : '';
      if (kind) params.push(kind);
      const { rows } = await pool.query(`${accountSelectSql()}
        WHERE a.tenant_id=$1 AND a.company_id=ANY($2::uuid[])${kindWhere}
        GROUP BY a.id,c.name,w.name,u.full_name ORDER BY a.active DESC,a.account_kind,a.name`, params);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/finance/accounts', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const input = accountSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user, input.companyId, client);
      if (input.warehouseId) {
        const valid = await client.query('SELECT 1 FROM warehouses WHERE id=$1 AND tenant_id=$2 AND company_id=$3', [input.warehouseId, req.user.tenant_id, input.companyId]);
        if (!valid.rows.length) throw requestError('Magazina nuk i përket kompanisë.', 400);
      }
      const id = randomUUID();
      const { rows } = await client.query(
        `INSERT INTO finance_accounts(id,tenant_id,company_id,warehouse_id,account_kind,code,name,currency,opening_balance,opening_date,
          responsible_user_id,bank_name,iban,account_number,active,notes,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [id,req.user.tenant_id,input.companyId,input.warehouseId||null,input.accountKind,input.code.toUpperCase(),input.name,
          input.currency.toUpperCase(),input.openingBalance,input.openingDate,input.responsibleUserId||null,input.bankName||null,
          input.iban||null,input.accountNumber||null,input.active,input.notes||null,req.user.id],
      );
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'FINANCE_ACCOUNT_CREATE',entityType:'finance_account',entityId:id,companyId:input.companyId,metadata:{kind:input.accountKind,code:input.code},ip:req.ip }, client);
      await addChange(client,req.user,input.companyId,'finance_account',id,'CREATE',{kind:input.accountKind});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'finance',{action:'account_created',id});
      res.status(201).json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.patch('/api/finance/accounts/:id', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    const client = await pool.connect();
    try {
      const input = accountSchema.partial().parse(req.body);
      await client.query('BEGIN');
      const current = await getAccountForUpdate(client, req.user, req.params.id);
      await assertCompanyAccess(req.user, current.company_id, client);
      if (input.companyId && input.companyId !== current.company_id) throw requestError('Kompania nuk mund të ndryshohet.', 400);
      if (input.accountKind && input.accountKind !== current.account_kind) throw requestError('Lloji i llogarisë nuk mund të ndryshohet.', 400);
      const next = {
        ...current,
        warehouse_id: input.warehouseId === undefined ? current.warehouse_id : input.warehouseId,
        code: input.code === undefined ? current.code : input.code.toUpperCase(),
        name: input.name === undefined ? current.name : input.name,
        currency: input.currency === undefined ? current.currency : input.currency.toUpperCase(),
        opening_balance: input.openingBalance === undefined ? current.opening_balance : input.openingBalance,
        opening_date: input.openingDate === undefined ? current.opening_date : input.openingDate,
        responsible_user_id: input.responsibleUserId === undefined ? current.responsible_user_id : input.responsibleUserId,
        bank_name: input.bankName === undefined ? current.bank_name : input.bankName,
        iban: input.iban === undefined ? current.iban : input.iban,
        account_number: input.accountNumber === undefined ? current.account_number : input.accountNumber,
        active: input.active === undefined ? current.active : input.active,
        notes: input.notes === undefined ? current.notes : input.notes,
      };
      const { rows } = await client.query(
        `UPDATE finance_accounts SET warehouse_id=$1,code=$2,name=$3,currency=$4,opening_balance=$5,opening_date=$6,
         responsible_user_id=$7,bank_name=$8,iban=$9,account_number=$10,active=$11,notes=$12,version=version+1,updated_at=NOW()
         WHERE id=$13 RETURNING *`,
        [next.warehouse_id,next.code,next.name,next.currency,next.opening_balance,next.opening_date,next.responsible_user_id,
          next.bank_name||null,next.iban||null,next.account_number||null,next.active,next.notes||null,current.id],
      );
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'FINANCE_ACCOUNT_UPDATE',entityType:'finance_account',entityId:current.id,companyId:current.company_id,metadata:input,ip:req.ip }, client);
      await addChange(client,req.user,current.company_id,'finance_account',current.id,'UPDATE',input);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'finance',{action:'account_updated',id:current.id});
      res.json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/finance/documents', authRequired, async (req, res, next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const params = [req.user.tenant_id, companyIds];
      const where = [];
      if (req.query.type) { params.push(z.enum(DOCUMENT_TYPES).parse(req.query.type)); where.push(`d.document_type=$${params.length}`); }
      if (req.query.status) { params.push(z.enum(STATUS).parse(req.query.status)); where.push(`d.status=$${params.length}`); }
      if (req.query.accountId) { params.push(z.string().uuid().parse(req.query.accountId)); where.push(`d.account_id=$${params.length}`); }
      if (req.query.from) { params.push(z.string().date().parse(req.query.from)); where.push(`d.document_date>=$${params.length}`); }
      if (req.query.to) { params.push(z.string().date().parse(req.query.to)); where.push(`d.document_date<=$${params.length}`); }
      if (req.query.search) { params.push(`%${text(req.query.search)}%`); where.push(`(d.document_no ILIKE $${params.length} OR d.description ILIKE $${params.length} OR COALESCE(d.reference_no,'') ILIKE $${params.length} OR COALESCE(p.name,'') ILIKE $${params.length})`); }
      const { rows } = await pool.query(`${documentSelectSql()}
        WHERE d.tenant_id=$1 AND d.company_id=ANY($2::uuid[]) ${where.length ? `AND ${where.join(' AND ')}` : ''}
        GROUP BY d.id,a.code,a.name,a.account_kind,p.name,p.nipt,c.name
        ORDER BY d.document_date DESC,d.created_at DESC LIMIT 1000`, params);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.get('/api/finance/documents/:id', authRequired, async (req, res, next) => {
    try {
      const { rows } = await pool.query(`${documentSelectSql()}
        WHERE d.id=$1 AND d.tenant_id=$2 GROUP BY d.id,a.code,a.name,a.account_kind,p.name,p.nipt,c.name LIMIT 1`,
        [req.params.id, req.user.tenant_id]);
      if (!rows[0]) throw requestError('Dokumenti financiar nuk u gjet.', 404);
      await assertCompanyAccess(req.user, rows[0].company_id);
      res.json(rows[0]);
    } catch (error) { next(error); }
  });

  async function saveDocument(req, res, next, documentId = null) {
    const client = await pool.connect();
    try {
      const input = documentSchema.parse(req.body);
      await client.query('BEGIN');
      await assertCompanyAccess(req.user, input.companyId, client);
      const account = await getAccountForUpdate(client, req.user, input.accountId);
      if (account.company_id !== input.companyId) throw requestError('Llogaria nuk i përket kompanisë.', 400);
      if (account.account_kind !== kindFor(input.documentType)) throw requestError('Lloji i dokumentit nuk përputhet me llogarinë.', 400);
      let current = null;
      if (documentId) {
        current = await getDocumentForUpdate(client, req.user, documentId);
        if (current.status !== 'DRAFT') throw requestError('Vetëm dokumenti Draft mund të editohet.', 409);
        if (current.company_id !== input.companyId || current.document_type !== input.documentType) throw requestError('Kompania dhe lloji nuk mund të ndryshohen.', 400);
      }
      const allocationTotal = input.allocations.reduce((sum, item) => sum + num(item.amount), 0);
      if (allocationTotal > input.amount * input.exchangeRate + 0.0001) throw requestError('Alokimi nuk mund të jetë më i madh se shuma e dokumentit.', 400);
      const documentNo = input.documentNo || current?.document_no || await nextNumber(
        client, req.user.tenant_id, input.companyId, input.documentType,
        { CASH_RECEIPT:'MA',CASH_PAYMENT:'MP',BANK_RECEIPT:'BA',BANK_PAYMENT:'BP' }[input.documentType], input.documentDate,
      );
      const id = current?.id || randomUUID();
      const amountBase = input.amount * input.exchangeRate;
      let rows;
      if (current) {
        ({ rows } = await client.query(
          `UPDATE finance_documents SET account_id=$1,partner_id=$2,document_no=$3,document_date=$4,value_date=$5,currency=$6,
           amount=$7,exchange_rate=$8,amount_base=$9,description=$10,reference_no=$11,version=version+1,updated_at=NOW()
           WHERE id=$12 RETURNING *`,
          [input.accountId,input.partnerId||null,documentNo,input.documentDate,input.valueDate||null,input.currency.toUpperCase(),
            input.amount,input.exchangeRate,amountBase,input.description,input.referenceNo||null,id],
        ));
        await client.query('DELETE FROM payment_allocations WHERE finance_document_id=$1', [id]);
      } else {
        ({ rows } = await client.query(
          `INSERT INTO finance_documents(id,tenant_id,company_id,account_id,partner_id,document_type,document_no,document_date,value_date,
           currency,amount,exchange_rate,amount_base,description,reference_no,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [id,req.user.tenant_id,input.companyId,input.accountId,input.partnerId||null,input.documentType,documentNo,input.documentDate,
            input.valueDate||null,input.currency.toUpperCase(),input.amount,input.exchangeRate,amountBase,input.description,input.referenceNo||null,req.user.id],
        ));
      }
      for (const allocation of input.allocations) {
        const valid = await client.query(
          `SELECT id,company_id,partner_id,total_amount,status FROM business_documents WHERE id=$1 AND tenant_id=$2`,
          [allocation.businessDocumentId, req.user.tenant_id],
        );
        const invoice = valid.rows[0];
        if (!invoice || invoice.company_id !== input.companyId || invoice.status === 'CANCELLED') throw requestError('Fatura e alokuar nuk është e vlefshme.', 400);
        if (input.partnerId && invoice.partner_id && invoice.partner_id !== input.partnerId) throw requestError('Fatura e alokuar nuk i përket partnerit.', 400);
        await client.query(
          `INSERT INTO payment_allocations(id,tenant_id,finance_document_id,business_document_id,amount) VALUES($1,$2,$3,$4,$5)`,
          [randomUUID(),req.user.tenant_id,id,allocation.businessDocumentId,allocation.amount],
        );
      }
      const action = current ? 'FINANCE_DOCUMENT_UPDATE' : 'FINANCE_DOCUMENT_CREATE';
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action,entityType:'finance_document',entityId:id,companyId:input.companyId,metadata:{documentType:input.documentType,documentNo,amount:input.amount},ip:req.ip }, client);
      await addChange(client,req.user,input.companyId,'finance_document',id,current ? 'UPDATE' : 'CREATE',{documentType:input.documentType});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'finance',{action:current?'document_updated':'document_created',id});
      res.status(current ? 200 : 201).json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  }

  app.post('/api/finance/documents', authRequired, requireRoles(...WRITE_ROLES), (req, res, next) => saveDocument(req, res, next));
  app.patch('/api/finance/documents/:id', authRequired, requireRoles(...WRITE_ROLES), (req, res, next) => saveDocument(req, res, next, req.params.id));

  app.post('/api/finance/documents/:id/post', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const document = await getDocumentForUpdate(client, req.user, req.params.id);
      await assertCompanyAccess(req.user, document.company_id, client);
      if (document.status !== 'DRAFT') throw requestError('Vetëm dokumenti Draft mund të postohet.', 409);
      const account = await getAccountForUpdate(client, req.user, document.account_id);
      if (signFor(document.document_type) < 0) {
        const balance = await computeAccountBalance(client, account.id);
        if (balance + 0.0001 < num(document.amount_base)) throw requestError(`Gjendje e pamjaftueshme në ${account.name}.`, 409);
      }
      await client.query(`UPDATE finance_documents SET status='POSTED',posted_by=$1,posted_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$2`, [req.user.id, document.id]);
      const allocations = await client.query('SELECT business_document_id FROM payment_allocations WHERE finance_document_id=$1', [document.id]);
      for (const item of allocations.rows) await refreshInvoicePayment(client, item.business_document_id);
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'FINANCE_DOCUMENT_POST',entityType:'finance_document',entityId:document.id,companyId:document.company_id,metadata:{documentType:document.document_type,documentNo:document.document_no,amount:document.amount},ip:req.ip }, client);
      await addChange(client,req.user,document.company_id,'finance_document',document.id,'POST',{documentType:document.document_type});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'finance',{action:'document_posted',id:document.id});
      res.json({ id:document.id,status:'POSTED',balance:await computeAccountBalance(pool,account.id) });
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/finance/documents/:id/cancel', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const document = await getDocumentForUpdate(client, req.user, req.params.id);
      await assertCompanyAccess(req.user, document.company_id, client);
      if (document.status === 'CANCELLED') throw requestError('Dokumenti është anuluar më parë.', 409);
      if (document.status === 'POSTED' && signFor(document.document_type) > 0) {
        const balance = await computeAccountBalance(client, document.account_id);
        if (balance + 0.0001 < num(document.amount_base)) throw requestError('Anulimi do të krijonte gjendje negative në llogari.', 409);
      }
      await client.query(`UPDATE finance_documents SET status='CANCELLED',cancelled_by=$1,cancelled_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$2`, [req.user.id, document.id]);
      const allocations = await client.query('SELECT business_document_id FROM payment_allocations WHERE finance_document_id=$1', [document.id]);
      for (const item of allocations.rows) await refreshInvoicePayment(client, item.business_document_id);
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'FINANCE_DOCUMENT_CANCEL',entityType:'finance_document',entityId:document.id,companyId:document.company_id,metadata:{previousStatus:document.status,documentNo:document.document_no},ip:req.ip }, client);
      await addChange(client,req.user,document.company_id,'finance_document',document.id,'CANCEL',{previousStatus:document.status});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'finance',{action:'document_cancelled',id:document.id});
      res.json({ id:document.id,status:'CANCELLED' });
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.post('/api/finance/documents/:id/reconcile', authRequired, requireRoles(...WRITE_ROLES), async (req, res, next) => {
    try {
      const input = z.object({ reconciled:z.boolean(), reconciliationRef:z.string().trim().max(160).optional().default('') }).parse(req.body);
      const { rows: existing } = await pool.query('SELECT * FROM finance_documents WHERE id=$1 AND tenant_id=$2', [req.params.id,req.user.tenant_id]);
      const document = existing[0];
      if (!document) throw requestError('Dokumenti financiar nuk u gjet.',404);
      await assertCompanyAccess(req.user,document.company_id);
      if (!document.document_type.startsWith('BANK_') || document.status!=='POSTED') throw requestError('Vetëm postat bankare të postuara mund të rakordohen.',409);
      const { rows } = await pool.query('UPDATE finance_documents SET reconciled=$1,reconciliation_ref=$2,version=version+1,updated_at=NOW() WHERE id=$3 RETURNING *',[input.reconciled,input.reconciliationRef||null,document.id]);
      await audit({ tenantId:req.user.tenant_id,userId:req.user.id,action:'BANK_RECONCILE',entityType:'finance_document',entityId:document.id,companyId:document.company_id,metadata:input,ip:req.ip });
      emitTenant(req.user.tenant_id,'finance',{action:'document_reconciled',id:document.id});
      res.json(rows[0]);
    } catch (error) { next(error); }
  });

  app.get('/api/finance/open-invoices', authRequired, async (req, res, next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const partnerId = req.query.partnerId ? z.string().uuid().parse(req.query.partnerId) : null;
      const params = [req.user.tenant_id,companyIds];
      let partnerWhere = '';
      if (partnerId) { params.push(partnerId); partnerWhere=' AND d.partner_id=$3'; }
      const { rows } = await pool.query(
        `SELECT d.id,d.company_id,d.partner_id,d.doc_type,d.document_no,d.document_date,d.total_amount,d.paid_amount,d.remaining_amount,d.payment_status,p.name AS partner_name
         FROM business_documents d LEFT JOIN business_partners p ON p.id=d.partner_id
         WHERE d.tenant_id=$1 AND d.company_id=ANY($2::uuid[]) AND d.doc_type IN ('PURCHASE_INVOICE','SALES_INVOICE')
           AND d.status='CONFIRMED' AND d.remaining_amount>0${partnerWhere}
         ORDER BY d.document_date,d.created_at`, params);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.get('/api/finance/reports/overview', authRequired, async (req, res, next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json({ totals:{},accounts:[],daily:[] });
      const from = req.query.from ? z.string().date().parse(req.query.from) : '1900-01-01';
      const to = req.query.to ? z.string().date().parse(req.query.to) : '2999-12-31';
      const [totals, accounts, daily, unreconciled] = await Promise.all([
        pool.query(`SELECT
          COALESCE(SUM(CASE WHEN status='POSTED' AND document_type='CASH_RECEIPT' THEN amount_base ELSE 0 END),0)::numeric AS cash_receipts,
          COALESCE(SUM(CASE WHEN status='POSTED' AND document_type='CASH_PAYMENT' THEN amount_base ELSE 0 END),0)::numeric AS cash_payments,
          COALESCE(SUM(CASE WHEN status='POSTED' AND document_type='BANK_RECEIPT' THEN amount_base ELSE 0 END),0)::numeric AS bank_receipts,
          COALESCE(SUM(CASE WHEN status='POSTED' AND document_type='BANK_PAYMENT' THEN amount_base ELSE 0 END),0)::numeric AS bank_payments,
          COUNT(*) FILTER(WHERE status='DRAFT')::int AS drafts,
          COUNT(*) FILTER(WHERE status='CANCELLED')::int AS cancelled
          FROM finance_documents WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND document_date BETWEEN $3 AND $4`,[req.user.tenant_id,companyIds,from,to]),
        pool.query(`${accountSelectSql()} WHERE a.tenant_id=$1 AND a.company_id=ANY($2::uuid[]) GROUP BY a.id,c.name,w.name,u.full_name ORDER BY a.account_kind,a.name`,[req.user.tenant_id,companyIds]),
        pool.query(`SELECT document_date,
          SUM(CASE WHEN status='POSTED' AND document_type IN ('CASH_RECEIPT','BANK_RECEIPT') THEN amount_base ELSE 0 END)::numeric AS receipts,
          SUM(CASE WHEN status='POSTED' AND document_type IN ('CASH_PAYMENT','BANK_PAYMENT') THEN amount_base ELSE 0 END)::numeric AS payments
          FROM finance_documents WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND document_date BETWEEN $3 AND $4
          GROUP BY document_date ORDER BY document_date`,[req.user.tenant_id,companyIds,from,to]),
        pool.query(`SELECT COUNT(*)::int AS count,COALESCE(SUM(amount_base),0)::numeric AS amount FROM finance_documents
          WHERE tenant_id=$1 AND company_id=ANY($2::uuid[]) AND status='POSTED' AND document_type LIKE 'BANK_%' AND reconciled=FALSE`,[req.user.tenant_id,companyIds]),
      ]);
      res.json({ totals:totals.rows[0],accounts:accounts.rows,daily:daily.rows,unreconciled:unreconciled.rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/finance/cash-closings', authRequired, async (req,res,next) => {
    try {
      const companyIds=await accessibleCompanyIds(req.user);if(!companyIds.length)return res.json([]);
      const {rows}=await pool.query(`SELECT c.*,a.code AS account_code,a.name AS account_name,u.full_name AS closed_by_name
        FROM cash_daily_closings c JOIN finance_accounts a ON a.id=c.account_id LEFT JOIN users u ON u.id=c.closed_by
        WHERE c.tenant_id=$1 AND c.company_id=ANY($2::uuid[]) ORDER BY c.closing_date DESC,c.created_at DESC`,[req.user.tenant_id,companyIds]);
      res.json(rows);
    }catch(error){next(error);}
  });

  app.post('/api/finance/cash-closings', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client=await pool.connect();
    try{
      const input=z.object({companyId:z.string().uuid(),accountId:z.string().uuid(),closingDate:z.string().date(),physicalBalance:z.coerce.number(),denominations:z.array(z.object({value:z.coerce.number(),count:z.coerce.number().int().min(0)})).default([]),notes:z.string().trim().max(2000).optional().default('')}).parse(req.body);
      await client.query('BEGIN');await assertCompanyAccess(req.user,input.companyId,client);const account=await getAccountForUpdate(client,req.user,input.accountId);
      if(account.company_id!==input.companyId||account.account_kind!=='CASH')throw requestError('Zgjidhni një llogari arke të kompanisë.',400);
      const systemBalance=await computeAccountBalance(client,account.id);const difference=input.physicalBalance-systemBalance;const id=randomUUID();
      const {rows}=await client.query(`INSERT INTO cash_daily_closings(id,tenant_id,company_id,account_id,closing_date,system_balance,physical_balance,difference,denominations,notes,closed_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,[id,req.user.tenant_id,input.companyId,input.accountId,input.closingDate,systemBalance,input.physicalBalance,difference,JSON.stringify(input.denominations),input.notes||null,req.user.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'CASH_DAILY_CLOSE',entityType:'cash_daily_closing',entityId:id,companyId:input.companyId,metadata:{accountId:input.accountId,systemBalance,physicalBalance:input.physicalBalance,difference},ip:req.ip},client);
      await addChange(client,req.user,input.companyId,'cash_daily_closing',id,'CREATE',{difference});await client.query('COMMIT');emitTenant(req.user.tenant_id,'finance',{action:'cash_closed',id});res.status(201).json(rows[0]);
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });
}
