from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
server=ROOT/'apps/api/src/server.js'
core=ROOT/'apps/api/src/phase4-export-logistics.js'
package=ROOT/'apps/api/package.json'

server_text=server.read_text(encoding='utf-8')
import_line="import { installPhase4ExportExtensionRoutes, migratePhase4ExportExtensions } from './phase4-export-extensions.js';"
if import_line not in server_text:
    anchor="import { installPhase4ExportLogisticsRoutes, migratePhase4ExportLogistics } from './phase4-export-logistics.js';"
    if anchor not in server_text: raise SystemExit('Export logistics import anchor missing')
    server_text=server_text.replace(anchor,anchor+'\n'+import_line,1)
if 'await migratePhase4ExportExtensions(client);' not in server_text:
    anchor='    await migratePhase4ExportLogistics(client);'
    if anchor not in server_text: raise SystemExit('Export migration anchor missing')
    server_text=server_text.replace(anchor,anchor+'\n    await migratePhase4ExportExtensions(client);',1)
if 'installPhase4ExportExtensionRoutes({' not in server_text:
    anchor='installPhase4ExportLogisticsRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });'
    if anchor not in server_text: raise SystemExit('Export route anchor missing')
    server_text=server_text.replace(anchor,anchor+'\ninstallPhase4ExportExtensionRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });',1)
server.write_text(server_text,encoding='utf-8')

core_text=core.read_text(encoding='utf-8')
old="const input=z.object({sealNo:z.string().trim().min(1).max(80),containerNo:z.string().trim().max(80).optional().default(''),cmrNo:z.string().trim().max(100).optional().default('')}).parse(req.body);"
new="const input=z.object({sealNo:z.string().trim().min(1).max(80),containerNo:z.string().trim().max(80).optional().default(''),cmrNo:z.string().trim().min(1).max(100),packingListNo:z.string().trim().min(1).max(100),commercialInvoiceNo:z.string().trim().min(1).max(100),customsDeclarationNo:z.string().trim().max(120).optional().default('')}).parse(req.body);"
if old in core_text: core_text=core_text.replace(old,new,1)
old="UPDATE export_shipments SET status='SEALED',seal_no=$1,container_no=COALESCE(NULLIF($2,''),container_no),cmr_no=COALESCE(NULLIF($3,''),cmr_no),sealed_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$4"
new="UPDATE export_shipments SET status='SEALED',seal_no=$1,container_no=COALESCE(NULLIF($2,''),container_no),cmr_no=$3,packing_list_no=$4,commercial_invoice_no=$5,customs_declaration_no=COALESCE(NULLIF($6,''),customs_declaration_no),sealed_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$7"
if old in core_text: core_text=core_text.replace(old,new,1)
old='[input.sealNo,input.containerNo,input.cmrNo,current.id]'
new='[input.sealNo,input.containerNo,input.cmrNo,input.packingListNo,input.commercialInvoiceNo,input.customsDeclarationNo,current.id]'
if old in core_text: core_text=core_text.replace(old,new,1)
old="UPDATE export_shipments SET status='LOADING',version=version+1,updated_at=NOW() WHERE id=$1"
new="UPDATE export_shipments SET status='LOADING',loading_started_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1"
if old in core_text: core_text=core_text.replace(old,new,1)
old="if(current.status!=='SEALED')throw requestError('Vetëm Ngarkesa e Vulosur mund të niset.',409);const items="
new="if(current.status!=='SEALED')throw requestError('Vetëm Ngarkesa e Vulosur mund të niset.',409);if(!current.seal_no||!current.cmr_no||!current.packing_list_no||!current.commercial_invoice_no)throw requestError('Vula, CMR, Packing List dhe Commercial Invoice janë të detyrueshme para nisjes.',409);const items="
if old in core_text: core_text=core_text.replace(old,new,1)
old="UPDATE export_shipments SET status='DISPATCHED',departure_at=NOW(),delivery_document_id=$1,dispatched_by=$2,version=version+1,updated_at=NOW() WHERE id=$3"
new="UPDATE export_shipments SET status='DISPATCHED',departure_at=NOW(),dispatched_at=NOW(),delivery_document_id=$1,dispatched_by=$2,version=version+1,updated_at=NOW() WHERE id=$3"
if old in core_text: core_text=core_text.replace(old,new,1)
for required in ['commercialInvoiceNo','packing_list_no=$4','Vula, CMR, Packing List','dispatched_at=NOW()','loading_started_at=NOW()']:
    if required not in core_text: raise SystemExit(f'Export core patch missing: {required}')
core.write_text(core_text,encoding='utf-8')

pkg=json.loads(package.read_text(encoding='utf-8'))
check=pkg['scripts']['check']
for file in ['src/phase4-traceability.js','src/phase4-export-extensions.js']:
    token=f'node --check {file}'
    if token not in check: check += ' && '+token
pkg['scripts']['check']=check
package.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Phase 4 export extensions patched successfully.')
