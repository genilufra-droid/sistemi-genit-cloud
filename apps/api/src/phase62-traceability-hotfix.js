import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES = ['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','OPERATOR_PESHORE'];
const num = (value) => Number(value || 0);
const text = (value) => String(value ?? '').trim();

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function migratePhase62TraceabilityHotfix(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS trace_weight_ticket_lines (
      id UUID PRIMARY KEY,
      weight_ticket_id UUID NOT NULL REFERENCES weight_tickets(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      packaging_count NUMERIC(18,3) NOT NULL DEFAULT 0,
      gross_kg NUMERIC(18,6) NOT NULL DEFAULT 0,
      packaging_kg NUMERIC(18,6) NOT NULL DEFAULT 0,
      net_kg NUMERIC(18,6) NOT NULL DEFAULT 0,
      note VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(weight_ticket_id,line_no),
      CHECK(packaging_count >= 0 AND gross_kg >= 0 AND packaging_kg >= 0 AND net_kg >= 0),
      CHECK(packaging_kg <= gross_kg + 0.000001)
    );
    CREATE INDEX IF NOT EXISTS idx_trace_weight_lines_ticket ON trace_weight_ticket_lines(weight_ticket_id,line_no);
  `);
}

export function installPhase62TraceabilityHotfixRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const lineSchema = z.object({
    packagingCount:z.coerce.number().min(0), grossKg:z.coerce.number().min(0), packagingKg:z.coerce.number().min(0), note:z.string().trim().max(500).optional().default(''),
  }).refine((line)=>line.packagingKg <= line.grossKg,{message:'Pesha e ambalazhit nuk mund të jetë më e madhe se pesha bruto.'});
  const linesSchema = z.object({ lines:z.array(lineSchema).min(1).max(500) });
  const plantUpdateSchema = z.object({
    farmId:z.string().uuid(), productId:z.string().uuid().nullable().optional(), code:z.string().trim().min(1).max(80), name:z.string().trim().min(1).max(220),
    botanicalName:z.string().trim().max(220).optional().default(''), localName:z.string().trim().max(220).optional().default(''), plantPart:z.string().trim().max(140).optional().default(''),
    organicStatus:z.string().trim().max(80).optional().default(''), certificateNo:z.string().trim().max(140).optional().default(''), harvestSeason:z.string().trim().max(140).optional().default(''),
    notes:z.string().trim().max(2000).optional().default(''), active:z.boolean().optional().default(true),
  });

  app.get('/api/trace/workflow/weights/:id/details', authRequired, async (req,res,next) => {
    try {
      const { rows } = await pool.query(`SELECT wt.*,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name,
        w.code AS warehouse_code,w.name AS warehouse_name,f.code AS farm_code,f.name AS farm_name,pa.code AS parcel_code,pa.name AS parcel_name,
        tp.code AS plant_code,tp.name AS plant_name,tp.botanical_name,tp.local_name,tp.plant_part,td.dossier_no,td.status AS dossier_status
        FROM weight_tickets wt JOIN business_partners bp ON bp.id=wt.supplier_id JOIN products p ON p.id=wt.product_id JOIN warehouses w ON w.id=wt.warehouse_id
        LEFT JOIN trace_farms f ON f.id=wt.farm_id LEFT JOIN trace_parcels pa ON pa.id=wt.parcel_id LEFT JOIN trace_plants tp ON tp.id=wt.plant_id
        LEFT JOIN trace_dossiers td ON td.id=wt.trace_dossier_id WHERE wt.id=$1 AND wt.tenant_id=$2 LIMIT 1`, [req.params.id,req.user.tenant_id]);
      const weight = rows[0];
      if (!weight) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,weight.company_id);
      const lines = await pool.query(`SELECT * FROM trace_weight_ticket_lines WHERE weight_ticket_id=$1 ORDER BY line_no`, [weight.id]);
      res.json({weight,lines:lines.rows});
    } catch (error) { next(error); }
  });

  app.put('/api/trace/workflow/weights/:id/lines', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = linesSchema.parse(req.body);
      await client.query('BEGIN');
      const currentResult = await client.query(`SELECT * FROM weight_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const current = currentResult.rows[0];
      if (!current) throw requestError('Formulari i peshës nuk u gjet.',404);
      await assertCompanyAccess(req.user,current.company_id,client);
      if (current.status !== 'DRAFT') throw requestError('Rreshtat mund të ndryshohen vetëm sa dokumenti është Draft.',409);
      const lines = input.lines.filter((line)=>num(line.packagingCount)>0 || num(line.grossKg)>0 || num(line.packagingKg)>0 || text(line.note));
      if (!lines.length) throw requestError('Duhet të ketë të paktën një rresht peshimi.');
      const totals = lines.reduce((out,line)=>{
        out.packagingCount += num(line.packagingCount);
        out.grossKg += num(line.grossKg);
        out.packagingKg += num(line.packagingKg);
        return out;
      },{packagingCount:0,grossKg:0,packagingKg:0});
      const net = totals.grossKg - totals.packagingKg;
      const accepted = net * (1-num(current.discount_percent)/100);
      if (net <= 0 || accepted <= 0) throw requestError('Pesha neto e pranuar duhet të jetë më e madhe se zero.');
      await client.query(`DELETE FROM trace_weight_ticket_lines WHERE weight_ticket_id=$1`, [current.id]);
      for (let index=0; index<lines.length; index++) {
        const line = lines[index];
        const lineNet = num(line.grossKg)-num(line.packagingKg);
        await client.query(`INSERT INTO trace_weight_ticket_lines(id,weight_ticket_id,line_no,packaging_count,gross_kg,packaging_kg,net_kg,note)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(),current.id,index+1,line.packagingCount,line.grossKg,line.packagingKg,lineNet,line.note||null]);
      }
      const totalValue = accepted*num(current.unit_price);
      await client.query(`UPDATE weight_tickets SET bags_count=$1,gross_weight=$2,packaging_weight=$3,net_weight=$4,accepted_weight=$5,total_value=$6,version=version+1,updated_at=NOW() WHERE id=$7`,
        [totals.packagingCount,totals.grossKg,totals.packagingKg,net,accepted,totalValue,current.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'WEIGHT_LINES_REPLACE',entityType:'weight_ticket',entityId:current.id,companyId:current.company_id,
        metadata:{lineCount:lines.length,packagingCount:totals.packagingCount,grossKg:totals.grossKg,packagingKg:totals.packagingKg,netKg:accepted},ip:req.ip},client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'weights',{action:'linesUpdated',id:current.id});
      res.json({id:current.id,lineCount:lines.length,...totals,netKg:accepted,totalValue});
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.patch('/api/trace/workflow/plants/:id', authRequired, requireRoles(...WRITE_ROLES), async (req,res,next) => {
    const client = await pool.connect();
    try {
      const input = plantUpdateSchema.parse(req.body);
      await client.query('BEGIN');
      const currentResult = await client.query(`SELECT * FROM trace_plants WHERE id=$1 AND tenant_id=$2 FOR UPDATE`, [req.params.id,req.user.tenant_id]);
      const current = currentResult.rows[0];
      if (!current) throw requestError('Bima nuk u gjet.',404);
      await assertCompanyAccess(req.user,current.company_id,client);
      const farm = await client.query(`SELECT id FROM trace_farms WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.farmId,req.user.tenant_id,current.company_id]);
      if (!farm.rowCount) throw requestError('Ferma nuk është e vlefshme.');
      if (input.productId) {
        const product = await client.query(`SELECT id FROM products WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`, [input.productId,req.user.tenant_id,current.company_id]);
        if (!product.rowCount) throw requestError('Artikulli i lidhur nuk është i vlefshëm.');
      }
      const { rows } = await client.query(`UPDATE trace_plants SET farm_id=$1,product_id=$2,code=$3,name=$4,botanical_name=$5,local_name=$6,plant_part=$7,
        organic_status=$8,certificate_no=$9,harvest_season=$10,notes=$11,active=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
        [input.farmId,input.productId||null,input.code.toUpperCase(),input.name,input.botanicalName||null,input.localName||null,input.plantPart||null,input.organicStatus||null,
         input.certificateNo||null,input.harvestSeason||null,input.notes||null,input.active,current.id]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'TRACE_PLANT_UPDATE',entityType:'trace_plant',entityId:current.id,companyId:current.company_id,
        metadata:{farmId:input.farmId,code:input.code,name:input.name},ip:req.ip},client);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'tracePlants',{action:'updated',id:current.id});
      res.json(rows[0]);
    } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
  });

  app.get('/api/trace/workflow/registry', authRequired, async (req,res,next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json({farms:[],plants:[],parcels:[]});
      const [farms,plants,parcels] = await Promise.all([
        pool.query(`SELECT f.*,bp.code AS supplier_code,bp.name AS supplier_name,COUNT(DISTINCT tp.id)::int AS plant_count,COUNT(DISTINCT pa.id)::int AS parcel_count
          FROM trace_farms f LEFT JOIN business_partners bp ON bp.id=f.supplier_id LEFT JOIN trace_plants tp ON tp.farm_id=f.id LEFT JOIN trace_parcels pa ON pa.farm_id=f.id
          WHERE f.tenant_id=$1 AND f.company_id=ANY($2::uuid[]) GROUP BY f.id,bp.code,bp.name ORDER BY f.active DESC,bp.code,f.name`, [req.user.tenant_id,companyIds]),
        pool.query(`SELECT tp.*,f.code AS farm_code,f.name AS farm_name,bp.code AS supplier_code,bp.name AS supplier_name,p.code AS product_code,p.name AS product_name
          FROM trace_plants tp JOIN trace_farms f ON f.id=tp.farm_id LEFT JOIN business_partners bp ON bp.id=f.supplier_id LEFT JOIN products p ON p.id=tp.product_id
          WHERE tp.tenant_id=$1 AND tp.company_id=ANY($2::uuid[]) ORDER BY tp.active DESC,bp.code,f.name,tp.name`, [req.user.tenant_id,companyIds]),
        pool.query(`SELECT pa.*,f.code AS farm_code,f.name AS farm_name FROM trace_parcels pa JOIN trace_farms f ON f.id=pa.farm_id
          WHERE pa.tenant_id=$1 AND pa.company_id=ANY($2::uuid[]) ORDER BY pa.active DESC,f.name,pa.name`, [req.user.tenant_id,companyIds]),
      ]);
      res.json({farms:farms.rows,plants:plants.rows,parcels:parcels.rows});
    } catch (error) { next(error); }
  });

  app.get('/api/trace/workflow/dossiers/:id/audit', authRequired, async (req,res,next) => {
    try {
      const dossierResult = await pool.query(`SELECT * FROM trace_dossiers WHERE id=$1 AND tenant_id=$2`, [req.params.id,req.user.tenant_id]);
      const dossier = dossierResult.rows[0];
      if (!dossier) throw requestError('Dosja nuk u gjet.',404);
      await assertCompanyAccess(req.user,dossier.company_id);
      const { rows } = await pool.query(`SELECT e.*,u.full_name AS user_full_name FROM system_action_events e LEFT JOIN users u ON u.id=e.user_id
        WHERE e.tenant_id=$1 AND (
          (e.entity_type='trace_dossier' AND e.entity_id=$2) OR
          e.entity_id IN (SELECT entity_id FROM trace_dossier_documents WHERE dossier_id=$2) OR
          e.entity_id IN (SELECT lot_id FROM trace_dossier_lots WHERE dossier_id=$2) OR
          e.document_no IN (SELECT document_no FROM trace_dossier_documents WHERE dossier_id=$2 AND document_no IS NOT NULL)
        ) ORDER BY e.occurred_at,e.sequence_no`, [req.user.tenant_id,dossier.id]);
      res.json(rows);
    } catch (error) { next(error); }
  });
}
