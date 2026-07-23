from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'apps/api/src/server.js'
source = TARGET.read_text(encoding='utf-8')

import_anchor = "import { installPhase4ExportLogisticsRoutes, migratePhase4ExportLogistics } from './phase4-export-logistics.js';"
import_line = "import { installGlobalMasterDataRoutes, migrateGlobalMasterData } from './global-master-data.js';"
if import_line not in source:
    if import_anchor not in source:
        raise SystemExit('Mungon import anchor për global master-data.')
    source = source.replace(import_anchor, import_anchor + '\n' + import_line, 1)

migrate_anchor = '    await migratePhase4ExportLogistics(client);'
migrate_line = '    await migrateGlobalMasterData(client);'
if migrate_line not in source:
    if migrate_anchor not in source:
        raise SystemExit('Mungon migrate anchor për global master-data.')
    source = source.replace(migrate_anchor, migrate_anchor + '\n' + migrate_line, 1)

install_anchor = "installPhase4ExportLogisticsRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });"
install_line = "installGlobalMasterDataRoutes({ app, pool, authRequired, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });"
if install_line not in source:
    if install_anchor not in source:
        raise SystemExit('Mungon route anchor për global master-data.')
    source = source.replace(install_anchor, install_anchor + '\n' + install_line, 1)

TARGET.write_text(source, encoding='utf-8')
check = TARGET.read_text(encoding='utf-8')
for marker in (import_line, migrate_line, install_line):
    if check.count(marker) != 1:
        raise SystemExit(f'Integrimi nuk është idempotent: {marker}')
if "phase5-finance" in check or "phase5-launcher" in check:
    raise SystemExit('Phase 5 duhet të mbetet në launcher-in e dedikuar, jo të dublohet në server.js.')
print('Global master-data server integration patched; Phase 5 launcher remains authoritative.')
