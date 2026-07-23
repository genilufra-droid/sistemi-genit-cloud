from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
ops=ROOT/'apps/api/src/phase6-operations.js'
launcher=ROOT/'apps/api/src/phase5-launcher.js'
pkg=ROOT/'apps/api/package.json'

text=ops.read_text(encoding='utf-8')
text=text.replace("const dateOnly=(v)=>String(v||new Date().toISOString()).slice(0,10);","const dateOnly=(v)=>v instanceof Date?v.toISOString().slice(0,10):String(v||new Date().toISOString()).slice(0,10);")
old="""  ALTER TABLE expenses ADD CONSTRAINT expenses_trip_fk FOREIGN KEY(trip_id) REFERENCES logistics_trips(id) ON DELETE SET NULL NOT VALID;
  ALTER TABLE expenses ADD CONSTRAINT expenses_maintenance_fk FOREIGN KEY(maintenance_id) REFERENCES logistics_maintenance(id) ON DELETE SET NULL NOT VALID;"""
new="""  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expenses_trip_fk') THEN
      ALTER TABLE expenses ADD CONSTRAINT expenses_trip_fk FOREIGN KEY(trip_id) REFERENCES logistics_trips(id) ON DELETE SET NULL NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expenses_maintenance_fk') THEN
      ALTER TABLE expenses ADD CONSTRAINT expenses_maintenance_fk FOREIGN KEY(maintenance_id) REFERENCES logistics_maintenance(id) ON DELETE SET NULL NOT VALID;
    END IF;
  END $$;"""
if old in text:
    text=text.replace(old,new,1)
elif new not in text:
    raise SystemExit('Phase 6 constraint anchor missing')
for marker in ['v instanceof Date','expenses_trip_fk','expenses_maintenance_fk','installPhase6OperationsRoutes']:
    if marker not in text: raise SystemExit(f'Phase 6 source marker missing: {marker}')
ops.write_text(text,encoding='utf-8')

text=launcher.read_text(encoding='utf-8')
import_line="import { installPhase6OperationsRoutes, migratePhase6Operations } from './phase6-operations.js';"
if import_line not in text:
    anchor="import { installPhase5FinanceRoutes, migratePhase5Finance } from './phase5-finance.js';"
    if anchor not in text: raise SystemExit('Phase 5 import anchor missing')
    text=text.replace(anchor,anchor+'\n'+import_line,1)
if 'await migratePhase6Operations(pool);' not in text:
    anchor='await migratePhase5Finance(pool);'
    if anchor not in text: raise SystemExit('Phase 5 migration anchor missing')
    text=text.replace(anchor,anchor+'\nawait migratePhase6Operations(pool);',1)
if 'installPhase6OperationsRoutes({' not in text:
    anchor='installPhase5FinanceRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });'
    if anchor not in text: raise SystemExit('Phase 5 route anchor missing')
    text=text.replace(anchor,anchor+'\ninstallPhase6OperationsRoutes({ app:capturedApp, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });',1)
old_modules="{ group:'Operacione',phase:4,active:true,items:['Shpenzime','Logjistikë','Ngarkesa & Eksport','Asete & Investime'] },"
new_modules="{ group:'Operacione',phase:6,active:true,items:['Shpenzime','Kategori Shpenzimesh','Shoferë','Itinerare','Udhëtime','Karburant','Mirëmbajtje & Riparime','15 Raporte Logjistike','Asete & Investime','Amortizim','Raporte Asetesh'] },"
if old_modules in text: text=text.replace(old_modules,new_modules,1)
elif new_modules not in text: raise SystemExit('Operations module catalog anchor missing')
text=text.replace("console.log('Sistemi Genit Cloud Phase 5 Finance routes installed.');","console.log('Sistemi Genit Cloud Phase 6 Operations routes installed over Phase 5 Finance.');")
launcher.write_text(text,encoding='utf-8')

data=json.loads(pkg.read_text(encoding='utf-8'))
check=data['scripts']['check']
token='node --check src/phase6-operations.js'
if token not in check: check += ' && '+token
data['scripts']['check']=check
pkg.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Phase 6 Operations source and launcher integrated.')
