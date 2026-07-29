import PDFDocument from 'pdfkit';

const PAGE = { width: 595.28, height: 841.89 };
const n = (value) => Number(value || 0);
const amount = (value) => new Intl.NumberFormat('sq-AL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(value));
const date = (value) => value ? new Date(value).toLocaleDateString('sq-AL') : '—';
const cleanFile = (value) => String(value || 'dokument').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'dokument';
const label = (type) => ({
  PURCHASE_RFQ: 'KËRKESË PËR OFERTË', PURCHASE_ORDER: 'POROSI BLERJE', PURCHASE_RECEIPT: 'FLETË HYRJE', PURCHASE_INVOICE: 'FATURË BLERJE', SUPPLIER_RETURN: 'KTHIM FURNITORI',
  SALES_QUOTE: 'OFERTË SHITJE', SALES_ORDER: 'POROSI SHITJE', DELIVERY_NOTE: 'FLETË DALJE', SALES_INVOICE: 'FATURË SHITJE',
  CASH_RECEIPT: 'MANDAT ARKËTIMI', BANK_RECEIPT: 'MANDAT ARKËTIMI', CASH_PAYMENT: 'MANDAT PAGËSE', BANK_PAYMENT: 'MANDAT PAGËSE',
}[type] || 'DOKUMENT');

function fail(message, status = 404) { const error = new Error(message); error.status = status; return error; }
function text(value) { return String(value ?? '').trim() || '—'; }
function line(doc, x1, y1, x2, y2) { doc.moveTo(x1, y1).lineTo(x2, y2).stroke(); }
function box(doc, x, y, width, height) { doc.rect(x, y, width, height).stroke(); }
function write(doc, value, x, y, width, options = {}) {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 8).fillColor('#111')
    .text(String(value ?? ''), x + (options.pad ?? 3), y + (options.top ?? 3), {
      width: Math.max(1, width - ((options.pad ?? 3) * 2)),
      height: options.height || 40, align: options.align || 'left', lineBreak: true,
      ellipsis: true,
    });
}
function cell(doc, value, x, y, width, height, options = {}) { box(doc, x, y, width, height); write(doc, value, x, y, width, { ...options, height }); }
function pdfResponse(res, filename) {
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${cleanFile(filename)}.pdf"`,
    'Cache-Control': 'private, no-store, max-age=0',
  });
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: filename, Author: 'Sistemi Genit Cloud' } });
  doc.pipe(res); doc.lineWidth(0.65); return doc;
}

function invoicePdf(doc, source) {
  const x = 34, width = 527, inner = width - 2; let y = 30;
  doc.font('Helvetica').fontSize(18).text('FATURË', x, y, { width, align: 'center' }); y += 27;
  const company = `Shitësi: ${text(source.company_name)}\nAdresa: ${text(source.company_address)}\nNumri Unik i Identifikimit: ${text(source.company_nipt)}`;
  cell(doc, company, x, y, width, 56, { size: 8 }); y += 63;
  const issued = `Data e lëshimit: ${date(source.document_date)}\nNumri i faturës: ${text(source.document_no)}\nStatusi: ${text(source.status)}\nReferenca: ${text(source.reference_no || source.source_document_no)}`;
  cell(doc, issued, x, y, width, 64, { size: 8 }); y += 71;
  const partner = `Blerësi: ${text(source.partner_name)}\nAdresa: ${text(source.partner_address)}\nNumri Unik i Identifikimit: ${text(source.partner_nipt)}`;
  cell(doc, partner, x, y, width, 54, { size: 8 }); y += 61;
  const columns = [24, 128, 43, 36, 55, 34, 42, 52, 50, 63];
  const headers = ['Nr.', 'Përshkrimi i mallit ose shërbimit', 'Njësia', 'Sasia', 'Çmimi për njësi pa TVSH', 'Zbritje %', 'Norma e TVSH', 'Vlera pa TVSH', 'TVSH', 'Vlera Totale'];
  let cx = x; headers.forEach((header, index) => { cell(doc, header, cx, y, columns[index], 29, { size: 6.2, bold: true, align: 'center', top: 6 }); cx += columns[index]; }); y += 29;
  const rows = source.items || []; const visibleRows = Math.max(4, rows.length);
  for (let i = 0; i < visibleRows; i += 1) {
    const item = rows[i] || {}; const values = i < rows.length ? [i + 1, item.description, item.unit, amount(item.quantity), amount(item.unit_price), '0', amount(item.vat_rate), amount(item.line_net), amount(item.line_vat), amount(item.line_total)] : ['', '', '', '', '', '', '', '', '', ''];
    cx = x; values.forEach((value, index) => { cell(doc, value, cx, y, columns[index], 23, { size: 6.5, align: index === 1 ? 'left' : 'center', top: 6 }); cx += columns[index]; }); y += 23;
  }
  const totalX = x + columns.slice(0, 7).reduce((sum, value) => sum + value, 0); const totalWidth = columns.slice(7).reduce((sum, value) => sum + value, 0);
  [['Vlera pa TVSH', source.total_net], ['TVSH', source.total_vat], ['Totali për t’u paguar (LEK)', source.total_amount]].forEach(([name, value], index) => {
    cell(doc, name, totalX, y, totalWidth - 63, 20, { size: 7, align: 'right' }); cell(doc, `${amount(value)} ALL`, totalX + totalWidth - 63, y, 63, 20, { size: 7, bold: index === 2, align: 'right' }); y += 20;
  });
  y += 14; write(doc, 'Shpërndarja e TVSH-së', x, y, 170, { size: 8 }); y += 13;
  cell(doc, 'Norma e TVSH-së', x, y, 120, 22, { size: 7, bold: true, align: 'center' }); cell(doc, 'Baza e tatueshme (LEK)', x + 120, y, 180, 22, { size: 7, bold: true, align: 'center' }); cell(doc, 'Vlera e TVSH-së (LEK)', x + 300, y, 150, 22, { size: 7, bold: true, align: 'center' });
  y += 22; cell(doc, amount(source.items?.[0]?.vat_rate || 0), x, y, 120, 20, { size: 7, align: 'center' }); cell(doc, `${amount(source.total_net)} ALL`, x + 120, y, 180, 20, { size: 7, align: 'right' }); cell(doc, `${amount(source.total_vat)} ALL`, x + 300, y, 150, 20, { size: 7, align: 'right' });
  y += 37; write(doc, `Magazina: ${text(source.warehouse_name)}`, x, y, 250, { size: 8 }); write(doc, `Shënime: ${text(source.notes)}`, x, y + 15, 420, { size: 8 });
  const signY = Math.min(PAGE.height - 72, y + 55); ['Përgatiti', 'Magazinieri', 'Pranoi', 'Firma / Vula'].forEach((name, index) => cell(doc, name, x + index * (width / 4), signY, width / 4, 38, { size: 8, align: 'center', top: 22 }));
}

function movementPdf(doc, source) {
  const x = 25, width = 545; let y = 24; const part = [140, 244, 161];
  cell(doc, `${text(source.company_name)}\nNIPT: ${text(source.company_nipt)}`, x, y, part[0], 72, { size: 9 });
  cell(doc, `${label(source.doc_type)}\nNr. ${text(source.document_no)}    Dt. ${date(source.document_date)}`, x + part[0], y, part[1], 72, { size: 16, bold: true, align: 'center', top: 13 });
  cell(doc, `Adresa ku shkon malli\n${text(source.partner_address || source.company_address)}\n${text(source.partner_name)}`, x + part[0] + part[1], y, part[2], 72, { size: 8 }); y += 72;
  cell(doc, 'Emri, mbiemri i personit të autorizuar\n' + text(source.partner_name), x, y, 242, 46, { size: 8 });
  cell(doc, 'Lloji e targa e mjetit transportues\n________________________', x + 242, y, 151, 46, { size: 8 });
  cell(doc, `Magazina\n${text(source.warehouse_name)}`, x + 393, y, 152, 46, { size: 8 }); y += 46;
  const cols = [28, 245, 64, 63, 69, 76]; const headers = ['Nr', 'Emërtimi i mallit', 'Njësia', 'Sasia', 'Çmimi', 'Vlefta']; let cx = x;
  headers.forEach((header, index) => { cell(doc, header, cx, y, cols[index], 27, { size: 11, bold: true, align: 'center', top: 7 }); cx += cols[index]; }); y += 27;
  const items = source.items || []; for (let i = 0; i < 21; i += 1) {
    const item = items[i] || {}; const values = i < items.length ? [i + 1, item.description, item.unit, amount(item.quantity), amount(item.unit_price), amount(item.line_total)] : [i + 1, '', '', '', '', '']; cx = x;
    values.forEach((value, index) => { cell(doc, value, cx, y, cols[index], 21, { size: 8, align: index === 1 ? 'left' : 'center', top: 5 }); cx += cols[index]; }); y += 21;
  }
  const sign = ['Emri, mbiemri\nNënshkrimi', 'Magazinieri', 'Marrësi përdorimi', 'Transportuesi', 'Llogaritari']; const signWidths = [135, 100, 125, 105, 80]; cx = x;
  sign.forEach((name, index) => { cell(doc, name, cx, y, signWidths[index], 46, { size: 8.5, bold: true, align: 'center', top: 8 }); cx += signWidths[index]; });
}

function mandateCopy(doc, source, y) {
  const x = 46, width = 503, h = 284, header = [126, 230, 147]; box(doc, x, y, width, h);
  cell(doc, `${text(source.company_name)}\nDega: ${text(source.company_address)}`, x, y, header[0], 70, { size: 11, top: 12 });
  cell(doc, `${label(source.document_type)}\nNr. ${text(source.document_no)}\nDt. ${date(source.document_date)}`, x + header[0], y, header[1], 70, { size: 16, bold: true, align: 'center', top: 10 });
  cell(doc, 'Nr. Serie\n__________________', x + header[0] + header[1], y, header[2], 70, { size: 11, top: 12 });
  const rows = [`${source.document_type?.endsWith('PAYMENT') ? 'Paguar' : 'Arkëtuar'} nga: ${text(source.partner_name)}`, `Shuma lekë: ${amount(source.amount)} ALL`, `Për: ${text(source.description || source.reference_no || source.account_name)}`];
  let cy = y + 70; rows.forEach((row) => { cell(doc, row, x, cy, width, 39, { size: 14, top: 10 }); cy += 39; });
  const footerY = y + h - 52; line(doc, x, footerY, x + width, footerY); ['Financieri', 'Drejtori', source.document_type?.endsWith('PAYMENT') ? 'Paguesi' : 'Arkëtari'].forEach((name, index) => cell(doc, name, x + (width / 3) * index, footerY, width / 3, 52, { size: 13, align: 'center', top: 27 }));
}
function financePdf(doc, source) { mandateCopy(doc, source, 55); mandateCopy(doc, source, 413); }

async function businessDocument(pool, user, id) {
  const { rows } = await pool.query(`SELECT d.*,c.name AS company_name,c.nipt AS company_nipt,c.address AS company_address,w.name AS warehouse_name,
      p.name AS partner_name,p.nipt AS partner_nipt,p.address AS partner_address,source.document_no AS source_document_no
      FROM business_documents d JOIN companies c ON c.id=d.company_id LEFT JOIN warehouses w ON w.id=d.warehouse_id
      LEFT JOIN business_partners p ON p.id=d.partner_id LEFT JOIN business_documents source ON source.id=d.source_document_id
      WHERE d.id=$1 AND d.tenant_id=$2 LIMIT 1`, [id, user.tenant_id]);
  if (!rows[0]) throw fail('Dokumenti nuk u gjet.');
  const itemRows = await pool.query('SELECT * FROM business_document_items WHERE document_id=$1 ORDER BY created_at', [id]);
  return { ...rows[0], items: itemRows.rows };
}
async function financeDocument(pool, user, id) {
  const { rows } = await pool.query(`SELECT d.*,c.name AS company_name,c.nipt AS company_nipt,c.address AS company_address,
      a.name AS account_name,a.code AS account_code,p.name AS partner_name,p.nipt AS partner_nipt,p.address AS partner_address
      FROM finance_documents d JOIN companies c ON c.id=d.company_id JOIN finance_accounts a ON a.id=d.account_id
      LEFT JOIN business_partners p ON p.id=d.partner_id WHERE d.id=$1 AND d.tenant_id=$2 LIMIT 1`, [id, user.tenant_id]);
  if (!rows[0]) throw fail('Dokumenti financiar nuk u gjet.'); return rows[0];
}

export function installPhase97DocumentPdfRoutes({ app, pool, authRequired, assertCompanyAccess }) {
  app.get('/api/documents/:id/pdf', authRequired, async (req, res, next) => {
    try { const source = await businessDocument(pool, req.user, req.params.id); await assertCompanyAccess(req.user, source.company_id); const doc = pdfResponse(res, `${label(source.doc_type)}_${source.document_no}`); if (['PURCHASE_RECEIPT', 'SUPPLIER_RETURN', 'DELIVERY_NOTE'].includes(source.doc_type)) movementPdf(doc, source); else invoicePdf(doc, source); doc.end(); } catch (error) { next(error); }
  });
  app.get('/api/finance/documents/:id/pdf', authRequired, async (req, res, next) => {
    try { const source = await financeDocument(pool, req.user, req.params.id); await assertCompanyAccess(req.user, source.company_id); const doc = pdfResponse(res, `${label(source.document_type)}_${source.document_no}`); financePdf(doc, source); doc.end(); } catch (error) { next(error); }
  });
}
