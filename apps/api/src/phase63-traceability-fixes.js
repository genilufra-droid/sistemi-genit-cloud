import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const text = (value) => String(value ?? '').trim();
const num = (value) => Number(value || 0);

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function camel(row) {
  const out = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    out[key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())] = value;
  });
  return out;
}

async function nextSequence(client, tenantId, companyId, key) {
  const { rows } = await client.query(`
    INSERT INTO trace_lot_sequences(tenant_id,company_id,sequence_key,last_value)
    VALUES($1,$2,$3,1)
    ON CONFLICT(tenant_id,company_id,sequence_key)
    DO UPDATE SET last_value=trace_lot_sequences.last_value+1,updated_at=NOW()
    RETURNING last_value`, [tenantId, companyId, key]);
  return Number(rows[0].last_value);
}

async function nextDocumentNo(client, tenantId, companyId, prefix, sourceDate) {
  const dateText = String(sourceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const year = dateText.slice(0, 4);
  const sequence = await nextSequence(client, tenantId, companyId, `${prefix}-${year}`);
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

async function addDossierDocument(client, input) {
  const sequenceResult = await client.query(
    'SELECT COALESCE(MAX(sequence_no),0)+1 AS next_no FROM trace_dossier_documents WHERE dossier_id=$1',
    [input.dossierId],
  );
  const sequenceNo = Number(sequenceResult.rows[0].next_no || 1);
  await client.query(`INSERT INTO trace_dossier_documents(
      id,dossier_id,document_type,entity_type,entity_id,document_no,document_date,sequence_no,status,title,snapshot,metadata,created_by
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
    ON CONFLICT(dossier_id,document_type,entity_id)
    DO UPDATE SET document_no=EXCLUDED.document_no,document_date=EXCLUDED.document_date,status=EXCLUDED.status,title=EXCLUDED.title,
      snapshot=EXCLUDED.snapshot,metadata=EXCLUDED.metadata,updated_at=NOW()`, [
    randomUUID(), input.dossierId, input.documentType, input.entityType, input.entityId,
    input.documentNo || null, input.documentDate || null, sequenceNo, input.status || 'POSTED',
    input.title || input.documentType, JSON.stringify(input.snapshot || {}), JSON.stringify(input.metadata || {}),
    input.createdBy || null,
  ]);
}

function patchRoute(router, path, method, handler, required = true) {
  let count = 0;
  for (const layer of router.stack || []) {
    if (layer.route?.path !== path || !layer.route.methods?.[method]) continue;
    const target = layer.route.stack?.[layer.route.stack.length - 1];
    if (!target) continue;
    target.handle = handler;
    count += 1;
  }
  if (required && count === 0) throw new Error(`Route hotfix nuk u instalua: ${method.toUpperCase()} ${path}`);
  return count;
}

export async function migratePhase63TraceabilityFixes(db) {
  await db.query(`
    ALTER TABLE trace_dossiers ALTER COLUMN farm_id DROP NOT NULL;
    ALTER TABLE trace_dossiers ALTER COLUMN plant_id DROP NOT NULL;
  `);
}

export function installPhase63TraceabilityFixes({ router, pool, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant }) {
  const openSchema = z.object({
    farmId: z.string().uuid().nullable().optional(),
    parcelId: z.string().uuid().nullable().optional(),
    plantId: z.string().uuid().nullable().optional(),
    packagingUnit: z.string().trim().min(1).max(40).default('thasë'),
  }).superRefine((value, ctx) => {
    if (value.parcelId && !value.farmId) ctx.addIssue({ code:'custom', path:['parcelId'], message:'Parcela kërkon Fermë.' });
    if (value.plantId && !value.farmId) ctx.addIssue({ code:'custom', path:['plantId'], message:'Bima kërkon Fermë.' });
  });

  const openDossier = async (req, res, next) => {
    const client = await pool.connect();
    try {
      const input = openSchema.parse(req.body || {});
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const weightResult = await client.query(`SELECT wt.*,bp.code AS supplier_code,bp.name AS supplier_name,
          p.code AS product_code,p.name AS product_name,p.base_unit,w.name AS warehouse_name
        FROM weight_tickets wt
        JOIN business_partners bp ON bp.id=wt.supplier_id
        JOIN products p ON p.id=wt.product_id
        JOIN warehouses w ON w.id=wt.warehouse_id
        WHERE wt.id=$1 AND wt.tenant_id=$2 FOR UPDATE OF wt`, [req.params.id, req.user.tenant_id]);
      const weight = weightResult.rows[0];
      if (!weight) throw requestError('Formulari i peshës nuk u gjet.', 404);
      await assertCompanyAccess(req.user, weight.company_id, client);
      if (weight.status !== 'DRAFT') throw requestError('Dosja hapet nga Formulari i Peshës Draft.', 409);

      let farm = null;
      let parcel = null;
      let plant = null;
      if (input.farmId) {
        const farmResult = await client.query(
          `SELECT * FROM trace_farms WHERE id=$1 AND tenant_id=$2 AND company_id=$3 AND active=TRUE`,
          [input.farmId, req.user.tenant_id, weight.company_id],
        );
        farm = farmResult.rows[0] || null;
        if (!farm) throw requestError('Ferma nuk është e vlefshme.');
        if (farm.supplier_id && farm.supplier_id !== weight.supplier_id) {
          throw requestError('Ferma nuk i përket fermerit/furnitorit të peshimit.');
        }
        if (input.parcelId) {
          const parcelResult = await client.query(
            `SELECT * FROM trace_parcels WHERE id=$1 AND farm_id=$2 AND tenant_id=$3 AND company_id=$4 AND active=TRUE`,
            [input.parcelId, farm.id, req.user.tenant_id, weight.company_id],
          );
          parcel = parcelResult.rows[0] || null;
          if (!parcel) throw requestError('Parcela nuk i përket Fermës së zgjedhur.');
        }
        if (input.plantId) {
          const plantResult = await client.query(
            `SELECT * FROM trace_plants WHERE id=$1 AND farm_id=$2 AND tenant_id=$3 AND company_id=$4 AND active=TRUE`,
            [input.plantId, farm.id, req.user.tenant_id, weight.company_id],
          );
          plant = plantResult.rows[0] || null;
          if (!plant) throw requestError('Bima nuk i përket Fermës së zgjedhur.');
          if (plant.product_id && plant.product_id !== weight.product_id) {
            throw requestError('Bima është lidhur me një artikull tjetër.');
          }
        }
      }

      let dossier = null;
      if (weight.trace_dossier_id) {
        const existing = await client.query(
          'SELECT * FROM trace_dossiers WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
          [weight.trace_dossier_id, req.user.tenant_id],
        );
        dossier = existing.rows[0] || null;
      }
      const originTitle = plant?.name || farm?.name || weight.product_name;
      const title = `${weight.supplier_code} · ${originTitle} · ${weight.document_no}`;
      if (!dossier) {
        const dossierNo = await nextDocumentNo(client, req.user.tenant_id, weight.company_id, 'DOS', weight.document_date);
        const dossierId = randomUUID();
        const { rows } = await client.query(`INSERT INTO trace_dossiers(
            id,tenant_id,company_id,dossier_no,supplier_id,farm_id,parcel_id,plant_id,weight_ticket_id,status,title,created_by
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'WEIGHED',$10,$11) RETURNING *`, [
          dossierId, req.user.tenant_id, weight.company_id, dossierNo, weight.supplier_id,
          farm?.id || null, parcel?.id || null, plant?.id || null, weight.id, title, req.user.id,
        ]);
        dossier = rows[0];
      } else {
        const { rows } = await client.query(`UPDATE trace_dossiers
          SET farm_id=$1,parcel_id=$2,plant_id=$3,title=$4,version=version+1,updated_at=NOW()
          WHERE id=$5 RETURNING *`, [farm?.id || null, parcel?.id || null, plant?.id || null, title, dossier.id]);
        dossier = rows[0];
      }

      await client.query(`UPDATE weight_tickets
        SET farm_id=$1,parcel_id=$2,plant_id=$3,trace_dossier_id=$4,packaging_unit=$5,updated_at=NOW()
        WHERE id=$6`, [farm?.id || null, parcel?.id || null, plant?.id || null, dossier.id, input.packagingUnit, weight.id]);
      const linesResult = await client.query(
        `SELECT line_no,packaging_count,gross_kg,packaging_kg,net_kg,note
         FROM trace_weight_ticket_lines WHERE weight_ticket_id=$1 ORDER BY line_no`,
        [weight.id],
      );
      await addDossierDocument(client, {
        dossierId:dossier.id, documentType:'WEIGHT_FORM', entityType:'weight_ticket', entityId:weight.id,
        documentNo:weight.document_no, documentDate:weight.document_date, title:'Formulari i Peshës', status:'DRAFT', createdBy:req.user.id,
        snapshot:{
          supplierCode:weight.supplier_code, supplierName:weight.supplier_name,
          productCode:weight.product_code, productName:weight.product_name,
          bagsCount:num(weight.bags_count), packagingUnit:input.packagingUnit,
          grossWeight:num(weight.gross_weight), packagingWeight:num(weight.packaging_weight),
          netWeight:num(weight.accepted_weight), unitPrice:num(weight.unit_price), totalValue:num(weight.total_value),
          farmName:farm?.name || '', plantName:plant?.name || '', parcelName:parcel?.name || '',
          lines:linesResult.rows.map((row) => ({
            lineNo:row.line_no, packagingCount:num(row.packaging_count), grossKg:num(row.gross_kg),
            packagingKg:num(row.packaging_kg), netKg:num(row.net_kg), note:row.note || '',
          })),
        },
      });
      await audit({
        tenantId:req.user.tenant_id, userId:req.user.id, action:'TRACE_DOSSIER_OPEN', entityType:'trace_dossier',
        entityId:dossier.id, companyId:weight.company_id,
        metadata:{ dossierNo:dossier.dossier_no, weightTicketId:weight.id, farmId:farm?.id || null, plantId:plant?.id || null, originOptional:!farm },
        ip:req.ip,
      }, client);
      await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
        VALUES($1,$2,'trace_dossier',$3,$4,$5::jsonb,$6)`, [
        req.user.tenant_id, weight.company_id, dossier.id, weight.trace_dossier_id ? 'UPDATE' : 'CREATE',
        JSON.stringify({ status:'WEIGHED', weightTicketId:weight.id, farmId:farm?.id || null, plantId:plant?.id || null }), req.user.id,
      ]);
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id, 'traceDossiers', { action:'upserted', id:dossier.id });
      res.status(weight.trace_dossier_id ? 200 : 201).json(dossier);
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  };

  const listDossiers = async (req, res, next) => {
    try {
      const companyIds = await accessibleCompanyIds(req.user);
      if (!companyIds.length) return res.json([]);
      const { rows } = await pool.query(`SELECT td.*,bp.code AS supplier_code,bp.name AS supplier_name,
          f.code AS farm_code,f.name AS farm_name,pa.code AS parcel_code,pa.name AS parcel_name,
          tp.code AS plant_code,tp.name AS plant_name,wt.document_no AS weight_document_no,
          l.lot_number,l.display_label,l.sales_lot_number
        FROM trace_dossiers td
        JOIN business_partners bp ON bp.id=td.supplier_id
        LEFT JOIN trace_farms f ON f.id=td.farm_id
        LEFT JOIN trace_parcels pa ON pa.id=td.parcel_id
        LEFT JOIN trace_plants tp ON tp.id=td.plant_id
        JOIN weight_tickets wt ON wt.id=td.weight_ticket_id
        LEFT JOIN trace_lots l ON l.id=td.root_lot_id
        WHERE td.tenant_id=$1 AND td.company_id=ANY($2::uuid[])
        ORDER BY td.created_at DESC`, [req.user.tenant_id, companyIds]);
      res.json(rows);
    } catch (error) { next(error); }
  };

  const dossierDetail = async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT td.*,bp.code AS supplier_code,bp.name AS supplier_name,
          f.code AS farm_code,f.name AS farm_name,pa.code AS parcel_code,pa.name AS parcel_name,
          tp.code AS plant_code,tp.name AS plant_name,tp.botanical_name,tp.plant_part,
          wt.document_no AS weight_document_no,wt.document_date AS weight_document_date,
          wt.bags_count,wt.packaging_unit,wt.gross_weight,wt.packaging_weight,wt.accepted_weight,
          wt.unit_price,wt.total_value,p.code AS product_code,p.name AS product_name
        FROM trace_dossiers td
        JOIN business_partners bp ON bp.id=td.supplier_id
        JOIN weight_tickets wt ON wt.id=td.weight_ticket_id
        JOIN products p ON p.id=wt.product_id
        LEFT JOIN trace_farms f ON f.id=td.farm_id
        LEFT JOIN trace_parcels pa ON pa.id=td.parcel_id
        LEFT JOIN trace_plants tp ON tp.id=td.plant_id
        WHERE td.id=$1 AND td.tenant_id=$2 LIMIT 1`, [req.params.id, req.user.tenant_id]);
      const dossier = rows[0];
      if (!dossier) throw requestError('Dosja e gjurmueshmërisë nuk u gjet.', 404);
      await assertCompanyAccess(req.user, dossier.company_id);
      const [timelineResult, lotsResult] = await Promise.all([
        pool.query(`SELECT d.*,u.full_name AS created_by_name
          FROM trace_dossier_documents d LEFT JOIN users u ON u.id=d.created_by
          WHERE d.dossier_id=$1 ORDER BY d.sequence_no,d.created_at`, [dossier.id]),
        pool.query(`SELECT l.*,dl.relation_type
          FROM trace_dossier_lots dl JOIN trace_lots l ON l.id=dl.lot_id
          WHERE dl.dossier_id=$1 ORDER BY l.created_at`, [dossier.id]),
      ]);
      res.json({
        dossier:camel(dossier),
        timeline:timelineResult.rows.map(camel),
        lots:lotsResult.rows.map(camel),
      });
    } catch (error) { next(error); }
  };

  patchRoute(router, '/api/trace/workflow/weights/:id/open-dossier', 'post', openDossier);
  patchRoute(router, '/api/trace/workflow/dossiers', 'get', listDossiers);
  patchRoute(router, '/api/trace/workflow/dossiers/:id', 'get', dossierDetail, false);
}
