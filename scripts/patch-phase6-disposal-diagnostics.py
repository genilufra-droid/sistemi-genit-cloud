from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'apps/api/src/phase6-operations.js'
workflow_path = ROOT / '.github/workflows/test-phase6-operations.yml'

source = source_path.read_text(encoding='utf-8')
start_marker = " app.post('/api/operations/assets/:id/dispose'"
end_marker = "\n\n const reportFilter="
start = source.find(start_marker)
end = source.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Asset disposal route markers were not found')

replacement = r''' app.post('/api/operations/assets/:id/dispose',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
  const c=await pool.connect();
  try{
    const body=z.object({disposalDate:z.string().date(),disposalValue:z.coerce.number().min(0).default(0),notes:z.string().trim().min(2).max(2000)}).parse(req.body);
    await c.query('BEGIN');
    const result=await c.query(`SELECT * FROM fixed_assets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[req.params.id,req.user.tenant_id]);
    const asset=result.rows[0];
    if(!asset)throw requestError('Aseti nuk u gjet.',404);
    await assertCompanyAccess(req.user,asset.company_id,c);
    if(!['ACTIVE','OUT_OF_SERVICE'].includes(asset.status))throw requestError('Aseti nuk mund të çregjistrohet në këtë status.',409);
    const updatedResult=await c.query(`UPDATE fixed_assets
      SET status='DISPOSED',disposal_date=$1,disposal_value=$2,
          notes=CASE WHEN COALESCE(notes,'')='' THEN $3::text ELSE notes || ' · ' || $3::text END,
          version=version+1,updated_at=NOW()
      WHERE id=$4 RETURNING *`,[body.disposalDate,body.disposalValue,body.notes,asset.id]);
    const updated=updatedResult.rows[0];
    const metadata={disposalValue:body.disposalValue,bookValue:num(asset.book_value),gainLoss:body.disposalValue-num(asset.book_value)};
    await c.query(`INSERT INTO asset_events(id,tenant_id,company_id,asset_id,event_type,event_date,from_status,to_status,description,metadata,created_by)
      VALUES($1,$2,$3,$4,'DISPOSE',$5,$6,'DISPOSED',$7,$8::jsonb,$9)`,[randomUUID(),req.user.tenant_id,asset.company_id,asset.id,body.disposalDate,asset.status,body.notes,JSON.stringify(metadata),req.user.id]);
    await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'ASSET_DISPOSE',entityType:'fixed_asset',entityId:asset.id,companyId:asset.company_id,metadata:{assetCode:asset.asset_code,...metadata},ip:req.ip},c);
    await addChange(c,req.user,asset.company_id,'fixed_asset',asset.id,'STATUS',{assetCode:asset.asset_code,from:asset.status,to:'DISPOSED',...metadata});
    await c.query('COMMIT');
    emitTenant(req.user.tenant_id,'assets',{action:'disposed',id:asset.id});
    res.json({id:asset.id,status:updated.status,disposalDate:updated.disposal_date,disposalValue:num(updated.disposal_value),bookValue:num(updated.book_value),gainLoss:metadata.gainLoss});
  }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}
 });'''

source = source[:start] + replacement + source[end:]
for marker in ["action:'ASSET_DISPOSE'", "RETURNING *`,[body.disposalDate", "gainLoss:body.disposalValue-num(asset.book_value)"]:
    if marker not in source:
        raise SystemExit(f'Disposal patch marker missing: {marker}')
source_path.write_text(source, encoding='utf-8')

workflow = workflow_path.read_text(encoding='utf-8')
old = "          mkdir -p /tmp/phase6-report\n          node <<'NODE' > /tmp/phase6-report/test.log 2>&1"
new = "          mkdir -p /tmp/phase6-report\n          set +e\n          node <<'NODE' > /tmp/phase6-report/test.log 2>&1"
if old in workflow:
    workflow = workflow.replace(old, new, 1)
elif new not in workflow:
    raise SystemExit('Phase 6 test start diagnostic anchor missing')
old = "          status=$?\n          echo '' >> /tmp/phase6-report/test.log"
new = "          status=$?\n          set -e\n          echo '' >> /tmp/phase6-report/test.log"
if old in workflow:
    workflow = workflow.replace(old, new, 1)
elif new not in workflow:
    raise SystemExit('Phase 6 test status diagnostic anchor missing')
workflow_path.write_text(workflow, encoding='utf-8')
print('Phase 6 asset disposal and test diagnostics patched.')
