import fs from 'node:fs';
import assert from 'node:assert/strict';

const sourcePath = new URL('../apps/web/phase64-weight-visible-actions.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8');

assert.equal(source.includes('MutationObserver'), false, 'Nuk lejohet MutationObserver te Formulari i Peshës.');
assert.equal(source.includes(':has('), false, 'Nuk lejohet CSS :has te Formulari i Peshës.');
assert.equal(source.includes('position:fixed'), false, 'Nuk lejohet overlay fixed.');
assert.equal(source.includes('sg64-weight-mobile-save'), false, 'Nuk lejohet buton lundrues mobile.');
assert.equal(source.includes('data-sg64-save-weight'), false, 'Nuk lejohet buton i dytë Ruaj.');
assert.equal(source.includes('setSavingState'), false, 'Nuk lejohet shtresë paralele ruajtjeje.');
assert.ok(source.includes("App.navigate('weightForm')"), 'Shto Formular duhet të përdorë navigimin normal.');
assert.ok(source.includes("form.querySelector('.sg62-form-actions')"), 'Duhet të ripërdoret shiriti ekzistues i veprimeve.');
assert.ok(source.includes("form.insertBefore(actions, head.nextSibling)"), 'Shiriti ekzistues duhet të zhvendoset nën kokë.');
assert.ok(source.includes("buttons[i].textContent = '💾 Ruaj Formularin'"), 'Ruaj Draft duhet të riemërtohet pa ndryshuar handler-in.');
assert.ok(source.includes('Shto Formular Peshimi'), 'Butoni Shto Formular Peshimi duhet të ekzistojë.');
assert.ok(source.includes('SG_PHASE64_WEIGHT_VISIBLE_ACTIONS_END'), 'Marker-i final duhet të ekzistojë.');

console.log('Phase 6.4 stable native weight actions validation passed.');