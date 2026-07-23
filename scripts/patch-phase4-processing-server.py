from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
server_path = root / 'apps/api/src/server.js'
package_path = root / 'apps/api/package.json'
server = server_path.read_text()

import_anchor = "import { installPhase4TraceabilityRoutes, migratePhase4Traceability } from './phase4-traceability.js';"
import_line = "import { installPhase4ProcessingPackagingRoutes, migratePhase4ProcessingPackaging } from './phase4-processing-packaging.js';"
if import_line not in server:
    if import_anchor not in server:
        raise SystemExit('Mungon import-i bazë i Fazës 4.')
    server = server.replace(import_anchor, import_anchor + '\n' + import_line)

migrate_anchor = '    await migratePhase4Traceability(client);'
migrate_line = '    await migratePhase4ProcessingPackaging(client);'
if migrate_line not in server:
    if migrate_anchor not in server:
        raise SystemExit('Mungon migrimi bazë i Fazës 4.')
    server = server.replace(migrate_anchor, migrate_anchor + '\n' + migrate_line)

install_anchor = "installPhase4TraceabilityRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });"
install_line = "installPhase4ProcessingPackagingRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });"
if install_line not in server:
    if install_anchor not in server:
        raise SystemExit('Mungon instalimi bazë i route-ve të Fazës 4.')
    server = server.replace(install_anchor, install_anchor + '\n' + install_line)

server_path.write_text(server)

package = json.loads(package_path.read_text())
check = package['scripts']['check']
needle = 'node --check src/phase4-processing-packaging.js'
if needle not in check:
    check += ' && ' + needle
package['scripts']['check'] = check
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

verify = server_path.read_text()
for token in (import_line, migrate_line, install_line):
    if verify.count(token) != 1:
        raise SystemExit(f'Patch-i nuk është idempotent: {token}')
print('Phase 4.2 server integration patched successfully.')
