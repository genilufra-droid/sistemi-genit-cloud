import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const WRITE_ROLES=['SUPER_ADMIN','COMPANY_ADMIN','MANAGER','FINANCIER','MAGAZINIER','ARKETAR'];
const num=(value)=>Number(value||0);
function requestError(message,status=400){const error=new Error(message);error.status=status;return error;}
async function addChange(client,user,companyId,entityType,entityId,operation,metadata={}){
  await client.query(`INSERT INTO cloud_change_events(tenant_id,company_id,entity_type,entity_id,operation,metadata,user_id)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[user.tenant_id,companyId,entityType,entityId,operation,JSON.stringify(metadata),user.id]);
}

export function installPhase6AssetDisposalRoute({app,pool,authRequired,requireRoles,assertCompanyAccess,audit,emitTenant}){
  app.post('/api/operations/assets/:id/dispose',authRequired,requireRoles(...WRITE_ROLES),async(req,res,next)=>{
    const client=await pool.connect();
    try{
      const input=z.object({
        disposalDate:z.string().date(),
        disposalValue:z.coerce.number().min(0).default(0),
        notes:z.string().trim().min(2).max(2000),
      }).parse(req.body);
      await client.query('BEGIN');
      const result=await client.query(`SELECT * FROM fixed_assets WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[req.params.id,req.user.tenant_id]);
      const asset=result.rows[0];
      if(!asset)throw requestError('Aseti nuk u gjet.',404);
      await assertCompanyAccess(req.user,asset.company_id,client);
      if(!['ACTIVE','OUT_OF_SERVICE'].includes(asset.status))throw requestError('Aseti nuk mund të çregjistrohet në këtë status.',409);
      const updatedResult=await client.query(`UPDATE fixed_assets
        SET status='DISPOSED',disposal_date=$1,disposal_value=$2,
            notes=CASE WHEN COALESCE(notes,'')='' THEN $3::text ELSE notes || ' · ' || $3::text END,
            version=version+1,updated_at=NOW()
        WHERE id=$4 RETURNING *`,[input.disposalDate,input.disposalValue,input.notes,asset.id]);
      const updated=updatedResult.rows[0];
      const metadata={
        disposalValue:input.disposalValue,
        bookValue:num(asset.book_value),
        gainLoss:input.disposalValue-num(asset.book_value),
      };
      await client.query(`INSERT INTO asset_events(id,tenant_id,company_id,asset_id,event_type,event_date,from_status,to_status,description,metadata,created_by)
        VALUES($1,$2,$3,$4,'DISPOSE',$5,$6,'DISPOSED',$7,$8::jsonb,$9)`,[
        randomUUID(),req.user.tenant_id,asset.company_id,asset.id,input.disposalDate,asset.status,input.notes,JSON.stringify(metadata),req.user.id,
      ]);
      await audit({tenantId:req.user.tenant_id,userId:req.user.id,action:'ASSET_DISPOSE',entityType:'fixed_asset',entityId:asset.id,companyId:asset.company_id,metadata:{assetCode:asset.asset_code,...metadata},ip:req.ip},client);
      await addChange(client,req.user,asset.company_id,'fixed_asset',asset.id,'STATUS',{assetCode:asset.asset_code,from:asset.status,to:'DISPOSED',...metadata});
      await client.query('COMMIT');
      emitTenant(req.user.tenant_id,'assets',{action:'disposed',id:asset.id});
      res.json({
        id:asset.id,
        status:updated.status,
        disposalDate:updated.disposal_date,
        disposalValue:num(updated.disposal_value),
        bookValue:num(updated.book_value),
        gainLoss:metadata.gainLoss,
      });
    }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
  });
}
