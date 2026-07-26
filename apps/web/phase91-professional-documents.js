(()=>{
'use strict';
const MARK='SG_PHASE91_PROFESSIONAL_DOCUMENTS_START';
if(window.__sgPhase91Installed)return;
window.__sgPhase91Installed=true;
console.info(MARK);

const esc=(v)=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=(v)=>String(v??'').toLocaleLowerCase('sq-AL').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const money=(v)=>{const n=Number(String(v??'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?new Intl.NumberFormat('sq-AL',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n):esc(v)};

function addStyles(){
 if(document.getElementById('sg91-style'))return;
 const s=document.createElement('style');s.id='sg91-style';s.textContent=`
 .sg91-overlay{position:fixed;inset:0;z-index:30000;background:rgba(15,23,42,.72);display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}
 .sg91-shell{width:min(1120px,100%);background:#e5e7eb;border-radius:12px;box-shadow:0 28px 70px rgba(0,0,0,.35);overflow:hidden}
 .sg91-toolbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:10px 14px;background:#0f172a;color:#fff}
 .sg91-toolbar strong{margin-right:auto}.sg91-toolbar button{border:1px solid #475569;background:#fff;color:#0f172a;border-radius:7px;padding:8px 12px;cursor:pointer;font-weight:700}.sg91-toolbar .sg91-close{background:#dc2626;color:#fff;border-color:#dc2626}
 .sg91-paper-wrap{padding:22px;display:flex;justify-content:center}.sg91-paper{width:210mm;min-height:297mm;background:#fff;color:#111827;padding:13mm 14mm;box-sizing:border-box;box-shadow:0 5px 22px rgba(0,0,0,.18);font-family:Arial,Helvetica,sans-serif}
 .sg91-head{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;border:2px solid #111827}.sg91-company{padding:12px}.sg91-logo{font-weight:900;font-size:25px;letter-spacing:.5px}.sg91-company p{margin:3px 0;font-size:12px}.sg91-title{border-left:2px solid #111827;padding:12px;text-align:center;display:flex;flex-direction:column;justify-content:center}.sg91-title h1{margin:0;font-size:21px;text-transform:uppercase}.sg91-title p{margin:5px 0 0;font-size:12px}
 .sg91-meta{display:grid;grid-template-columns:1fr 1fr;margin-top:10px;border:1px solid #111827}.sg91-meta section{padding:9px 11px;min-height:68px}.sg91-meta section+section{border-left:1px solid #111827}.sg91-meta h3{margin:0 0 6px;font-size:12px;text-transform:uppercase}.sg91-line{display:grid;grid-template-columns:120px 1fr;gap:6px;margin:3px 0;font-size:12px}.sg91-line b{font-weight:700}
 .sg91-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}.sg91-table th,.sg91-table td{border:1px solid #111827;padding:6px 5px;vertical-align:top}.sg91-table th{background:#e5e7eb!important;color:#111827!important;text-transform:uppercase;font-size:10px}.sg91-table td{background:#fff!important;color:#111827!important}.sg91-table .num{text-align:right}.sg91-table .center{text-align:center}
 .sg91-summary{margin-top:10px;margin-left:auto;width:42%;border-collapse:collapse;font-size:12px}.sg91-summary td{border:1px solid #111827;padding:7px}.sg91-summary td:last-child{text-align:right;font-weight:700}.sg91-notes{margin-top:12px;border:1px solid #111827;min-height:55px;padding:8px;font-size:11px}.sg91-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:38px;text-align:center;font-size:11px}.sg91-signatures div{border-top:1px solid #111827;padding-top:5px}
 @media(max-width:760px){.sg91-overlay{padding:0}.sg91-shell{border-radius:0}.sg91-toolbar{flex-wrap:wrap}.sg91-paper-wrap{padding:8px;justify-content:flex-start;overflow:auto}.sg91-paper{transform-origin:top left}.sg91-head{grid-template-columns:1fr}.sg91-title{border-left:0;border-top:2px solid #111827}}
 @media print{body>*:not(.sg91-overlay){display:none!important}.sg91-overlay{position:static!important;background:#fff!important;padding:0!important;display:block!important}.sg91-shell{box-shadow:none!important;width:auto!important;background:#fff!important}.sg91-toolbar{display:none!important}.sg91-paper-wrap{padding:0!important;display:block!important}.sg91-paper{box-shadow:none!important;width:210mm!important;min-height:297mm!important;margin:0!important}@page{size:A4;margin:0}}
 `;document.head.appendChild(s);
}

function contextFromRow(row){
 const table=row.closest('table');
 const heads=[...(table?.tHead?.rows?.[0]?.cells||[])].map(c=>(c.textContent||'').trim());
 const vals=[...row.cells].map(c=>(c.innerText||c.textContent||'').trim());
 const map={};heads.forEach((h,i)=>map[h]=vals[i]||'');
 return {table,heads,vals,map};
}
function findValue(ctx,re){for(const [k,v] of Object.entries(ctx.map))if(re.test(norm(k)))return v;return'';}
function docType(ctx){const text=norm([ctx.table?.previousElementSibling?.textContent,ctx.table?.closest('section,div')?.querySelector('h1,h2,h3')?.textContent,...ctx.heads].join(' '));if(/flete hyrje|hyrje magazine/.test(text))return'FLETË HYRJE';if(/flete dalje|dalje magazine/.test(text))return'FLETË DALJE';if(/transfer/.test(text))return'TRANSFERIM MAGAZINE';if(/blerje|purchase/.test(text))return'FATURË BLERJE';if(/shitje|sales/.test(text))return'FATURË SHITJE';if(/mandat arketimi/.test(text))return'MANDAT ARKËTIMI';if(/mandat pagese/.test(text))return'MANDAT PAGESE';return'DOKUMENT MAGAZINE';}
function isActionHeader(h){return /veprime|action/.test(norm(h));}
function isNumericHeader(h){return /sasi|cmim|vler|total|tvsh|zbrit|kg|peshe|debit|kredit/.test(norm(h));}
function renderRows(ctx){
 const keep=ctx.heads.map((h,i)=>({h,i})).filter(x=>!isActionHeader(x.h));
 return `<table class="sg91-table"><thead><tr><th class="center">Nr.</th>${keep.map(x=>`<th>${esc(x.h)}</th>`).join('')}</tr></thead><tbody><tr><td class="center">1</td>${keep.map(x=>`<td class="${isNumericHeader(x.h)?'num':''}">${esc(ctx.vals[x.i]||'')}</td>`).join('')}</tr>${Array.from({length:7},(_,i)=>`<tr><td class="center">${i+2}</td>${keep.map(()=>'<td>&nbsp;</td>').join('')}</tr>`).join('')}</tbody></table>`;
}
function totalFrom(ctx){return findValue(ctx,/^(total|vlera|shuma|grand total)/)||ctx.vals.find((v,i)=>isNumericHeader(ctx.heads[i]||'')&&/[0-9]/.test(v))||'';}
function buildDocument(ctx){
 const type=docType(ctx),nr=findValue(ctx,/nr|numer|dok/),date=findValue(ctx,/date|data/),party=findValue(ctx,/klient|furnitor|partner/),warehouse=findValue(ctx,/magazin/),total=totalFrom(ctx);
 return `<div class="sg91-paper">
 <header class="sg91-head"><section class="sg91-company"><div class="sg91-logo">SISTEMI GENIT</div><p><b>Kompania:</b> ${esc(localStorage.getItem('companyName')||'Kompania')}</p><p><b>NIPT:</b> ${esc(localStorage.getItem('companyNipt')||'')}</p><p><b>Adresa:</b> ${esc(localStorage.getItem('companyAddress')||'')}</p><p><b>Tel/E-mail:</b> ${esc(localStorage.getItem('companyContact')||'')}</p></section><section class="sg91-title"><h1>${esc(type)}</h1><p>Dokument zyrtar magazinë / financë</p></section></header>
 <div class="sg91-meta"><section><h3>Të dhënat e dokumentit</h3><div class="sg91-line"><b>Nr. dokumenti:</b><span>${esc(nr||'-')}</span></div><div class="sg91-line"><b>Data:</b><span>${esc(date||new Date().toLocaleDateString('sq-AL'))}</span></div><div class="sg91-line"><b>Magazina:</b><span>${esc(warehouse||'-')}</span></div></section><section><h3>Klienti / Furnitori</h3><div class="sg91-line"><b>Subjekti:</b><span>${esc(party||'-')}</span></div><div class="sg91-line"><b>NIPT:</b><span>-</span></div><div class="sg91-line"><b>Adresa:</b><span>-</span></div></section></div>
 ${renderRows(ctx)}
 <table class="sg91-summary"><tr><td>Nëntotali</td><td>${money(total||0)}</td></tr><tr><td>TVSH</td><td>0</td></tr><tr><td>TOTALI</td><td>${money(total||0)}</td></tr></table>
 <div class="sg91-notes"><b>Shënime:</b><br></div><div class="sg91-signatures"><div>Përgatiti</div><div>Dorëzoi</div><div>Pranoi</div></div>
 </div>`;
}
function openPreview(row){
 document.querySelector('.sg91-overlay')?.remove();
 const ctx=contextFromRow(row),overlay=document.createElement('div');overlay.className='sg91-overlay';overlay.innerHTML=`<div class="sg91-shell"><div class="sg91-toolbar"><strong>${esc(docType(ctx))}</strong><button type="button" data-sg91-print>Print / PDF</button><button type="button" data-sg91-close class="sg91-close">Mbyll</button></div><div class="sg91-paper-wrap">${buildDocument(ctx)}</div></div>`;
 document.body.appendChild(overlay);overlay.querySelector('[data-sg91-close]').onclick=()=>overlay.remove();overlay.querySelector('[data-sg91-print]').onclick=()=>window.print();overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
}
function install(){
 addStyles();
 document.addEventListener('click',e=>{const b=e.target.closest('button,a,[role="button"]');if(!b)return;const txt=norm([b.textContent,b.title,b.getAttribute('aria-label')].join(' '));if(!/^(shiko|view|hap|open)$/.test(txt))return;const row=b.closest('tr');if(!row||!row.closest('table'))return;const heads=[...(row.closest('table').tHead?.rows?.[0]?.cells||[])].map(c=>norm(c.textContent));if(!heads.some(h=>/dok|fatur|flete|nr|date|magazin|klient|furnitor/.test(h)))return;e.preventDefault();e.stopImmediatePropagation();openPreview(row);},true);
}
install();window.SGPhase91={openPreview};
})();