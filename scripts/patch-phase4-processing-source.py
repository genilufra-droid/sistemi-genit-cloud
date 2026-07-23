from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'apps/api/src/phase4-processing-packaging.js'
source = path.read_text()

start = source.index('async function createOutputLot(')
end = source.index('\n\nexport async function migratePhase4ProcessingPackaging', start)
replacement = '''async function createOutputLot(client, { user, companyId, warehouseId, product, sourceDate, lotType, qualityStatus, quantity, unitCost, origin, sourceDocumentId, sourceDocumentNo, sourceProcessOrderId = null, sourcePackagingOrderId = null, movementType, stockMovementType, expiryDate = null, notes = '' }) {
  const lotId = randomUUID();
  const lotNumber = await nextLotNumber(client,user.tenant_id,companyId,product,lotType,sourceDate);
  const status = lotStatusFromQuality(qualityStatus);
  await client.query(`INSERT INTO trace_lots(id,tenant_id,company_id,warehouse_id,product_id,supplier_id,farm_id,parcel_id,parent_lot_id,source_process_order_id,source_packaging_order_id,lot_number,lot_type,status,quality_status,harvest_date,production_date,expiry_date,quantity_created,quantity_available,quantity_consumed,base_unit,unit_cost,botanical_name,plant_part,location_text,notes,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,0,$20,$21,$22,$23,$24,$25,$26)`, [lotId,user.tenant_id,companyId,warehouseId,product.id,origin.supplierId,origin.farmId,origin.parcelId,origin.parentLotId,sourceProcessOrderId,sourcePackagingOrderId,lotNumber,lotType,status,qualityStatus,origin.harvestDate,sourceDate,expiryDate,quantity,product.base_unit||'kg',unitCost,origin.botanicalName,origin.plantPart,origin.locationText,notes||null,user.id]);
  await client.query(`INSERT INTO trace_lot_movements(id,tenant_id,company_id,lot_id,warehouse_id,product_id,movement_type,quantity,balance_after,source_document_type,source_document_id,source_document_no,metadata,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12::jsonb,$13)`, [randomUUID(),user.tenant_id,companyId,lotId,warehouseId,product.id,movementType,quantity,stockMovementType,sourceDocumentId,sourceDocumentNo,JSON.stringify({lotType,sourceProcessOrderId,sourcePackagingOrderId}),user.id]);
  await client.query(`INSERT INTO stock_movements(id,tenant_id,company_id,warehouse_id,product_id,movement_type,quantity_base,unit_cost,reference_type,reference_id,reference_no,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [randomUUID(),user.tenant_id,companyId,warehouseId,product.id,stockMovementType,quantity,unitCost,stockMovementType,sourceDocumentId,sourceDocumentNo,user.id]);
  return { id:lotId, lotNumber, lotType, status, qualityStatus, quantityCreated:quantity, quantityAvailable:quantity, unitCost };
}'''
source = source[:start] + replacement + source[end:]

anchor = "    CREATE INDEX IF NOT EXISTS idx_process_orders_scope ON process_orders(tenant_id,company_id,status,order_date DESC);"
columns = """    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS source_process_order_id UUID REFERENCES process_orders(id) ON DELETE RESTRICT;
    ALTER TABLE trace_lots ADD COLUMN IF NOT EXISTS source_packaging_order_id UUID REFERENCES packaging_orders(id) ON DELETE RESTRICT;

"""
if 'source_process_order_id UUID REFERENCES process_orders' not in source:
    if anchor not in source:
        raise SystemExit('Mungon ankorimi i indekseve të Fazës 4.2.')
    source = source.replace(anchor, columns + anchor)

process_call = "sourceDocumentId:order.id,sourceDocumentNo:order.work_order_no,movementType:'PROCESS_OUTPUT'"
process_fixed = "sourceDocumentId:order.id,sourceDocumentNo:order.work_order_no,sourceProcessOrderId:order.id,movementType:'PROCESS_OUTPUT'"
if process_call in source:
    source = source.replace(process_call, process_fixed)
elif process_fixed not in source:
    raise SystemExit('Mungon thirrja e lotit PROCESSED.')

pack_call = "sourceDocumentId:order.id,sourceDocumentNo:order.packaging_no,movementType:'PACKAGING_OUTPUT'"
pack_fixed = "sourceDocumentId:order.id,sourceDocumentNo:order.packaging_no,sourcePackagingOrderId:order.id,movementType:'PACKAGING_OUTPUT'"
if pack_call in source:
    source = source.replace(pack_call, pack_fixed)
elif pack_fixed not in source:
    raise SystemExit('Mungon thirrja e lotit PACKAGED.')

path.write_text(source)
check = path.read_text()
for token in ('source_process_order_id','source_packaging_order_id','sourceProcessOrderId:order.id','sourcePackagingOrderId:order.id'):
    if token not in check:
        raise SystemExit(f'Mungon korrigjimi i integritetit: {token}')
print('Phase 4.2 source integrity patched successfully.')
