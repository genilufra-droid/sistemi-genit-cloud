'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(__dirname,'../apps/api/src/server.js');
let source=fs.readFileSync(target,'utf8');

const importAnchor="import { installPhase4ProcessingPackagingRoutes, migratePhase4ProcessingPackaging } from './phase4-processing-packaging.js';";
const importLine="import { installPhase4ExportLogisticsRoutes, migratePhase4ExportLogistics } from './phase4-export-logistics.js';";
if(source.includes(importAnchor)&&!source.includes(importLine))source=source.replace(importAnchor,importAnchor+'\n'+importLine);
else if(!source.includes(importLine))throw new Error('Mungon pika e importit Phase 4.3.');

const migrateAnchor='    await migratePhase4ProcessingPackaging(client);';
const migrateLine='    await migratePhase4ExportLogistics(client);';
if(source.includes(migrateAnchor)&&!source.includes(migrateLine))source=source.replace(migrateAnchor,migrateAnchor+'\n'+migrateLine);
else if(!source.includes(migrateLine))throw new Error('Mungon pika e migrimit Phase 4.3.');

const routeAnchor='installPhase4ProcessingPackagingRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });';
const routeLine='installPhase4ExportLogisticsRoutes({ app, pool, authRequired, requireRoles, assertCompanyAccess, accessibleCompanyIds, audit, emitTenant });';
if(source.includes(routeAnchor)&&!source.includes(routeLine))source=source.replace(routeAnchor,routeAnchor+'\n'+routeLine);
else if(!source.includes(routeLine))throw new Error('Mungon pika e route-ve Phase 4.3.');

fs.writeFileSync(target,source);
const check=fs.readFileSync(target,'utf8');
[importLine,migrateLine,routeLine].forEach(function(marker){if(!check.includes(marker))throw new Error('Integrimi mungon: '+marker);});
console.log('Phase 4.3 export/logistics integrated into server.js.');
