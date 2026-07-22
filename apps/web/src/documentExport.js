const money = (value) => Number(value || 0).toLocaleString('sq-AL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const number = (value) => Number(value || 0).toLocaleString('sq-AL', {
  maximumFractionDigits: 3,
});

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const safeFileName = (value) => String(value || 'dokument')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'dokument';

export const DOCUMENT_LABELS = {
  PURCHASE_RFQ: 'Kërkesë për Ofertë',
  PURCHASE_ORDER: 'Porosi Blerjeje',
  PURCHASE_RECEIPT: 'Fletë-Hyrje / Pranim',
  PURCHASE_INVOICE: 'Faturë Blerjeje',
  SALES_QUOTE: 'Ofertë Shitjeje',
  SALES_ORDER: 'Porosi Shitjeje',
  DELIVERY_NOTE: 'Fletë-Dalje',
  SALES_INVOICE: 'Faturë Shitjeje',
};

export function documentTitle(document, fallback = 'Dokument') {
  return DOCUMENT_LABELS[document.doc_type || document.docType] || fallback;
}

export function normalizeDocument(document) {
  const items = Array.isArray(document.items) ? document.items : [];
  return {
    ...document,
    docType: document.docType || document.doc_type,
    documentNo: document.documentNo || document.document_no || '',
    documentDate: document.documentDate || document.document_date || '',
    companyName: document.companyName || document.company_name || '',
    warehouseName: document.warehouseName || document.warehouse_name || '',
    partnerName: document.partnerName || document.partner_name || '',
    totalNet: Number(document.totalNet ?? document.total_net ?? 0),
    totalVat: Number(document.totalVat ?? document.total_vat ?? 0),
    totalAmount: Number(document.totalAmount ?? document.total_amount ?? 0),
    items: items.map((item) => ({
      ...item,
      description: item.description || item.productName || item.product_name || '',
      unit: item.unit || 'copë',
      coefficient: Number(item.coefficient || 1),
      quantity: Number(item.quantity || 0),
      freeQuantity: Number(item.freeQuantity ?? item.free_quantity ?? 0),
      unitPrice: Number(item.unitPrice ?? item.unit_price ?? 0),
      vatRate: Number(item.vatRate ?? item.vat_rate ?? 0),
      lineNet: Number(item.lineNet ?? item.line_net ?? (Number(item.quantity || 0) * Number(item.unitPrice ?? item.unit_price ?? 0))),
      lineVat: Number(item.lineVat ?? item.line_vat ?? 0),
      lineTotal: Number(item.lineTotal ?? item.line_total ?? 0),
    })),
  };
}

export function buildDocumentHtml(rawDocument, fallbackTitle = 'Dokument') {
  const document = normalizeDocument(rawDocument);
  const title = documentTitle(document, fallbackTitle);
  const rows = document.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td class="num">${number(item.quantity)}</td>
      <td class="num">${number(item.freeQuantity)}</td>
      <td class="num">${money(item.unitPrice)}</td>
      <td class="num">${number(item.vatRate)}%</td>
      <td class="num">${money(item.lineTotal || (item.lineNet + item.lineVat))}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="sq">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)} ${escapeHtml(document.documentNo)}</title>
  <style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#171923;margin:0;background:#fff;font-size:12px}.page{width:100%;margin:0 auto}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #4f3f78;padding-bottom:12px;margin-bottom:18px}.brand h1{margin:0;color:#4f3f78;font-size:24px}.brand p,.meta p{margin:4px 0;color:#555}.doc-title{text-align:right}.doc-title h2{margin:0;font-size:22px}.doc-title strong{font-size:15px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.card{border:1px solid #d9d5e5;border-radius:8px;padding:10px}.card h3{margin:0 0 7px;color:#4f3f78;font-size:12px;text-transform:uppercase}.card p{margin:3px 0}.status{display:inline-block;padding:3px 8px;border-radius:999px;background:#eeeaf6;color:#4f3f78;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#4f3f78;color:#fff;text-align:left;padding:8px 6px;border:1px solid #4f3f78}td{padding:7px 6px;border:1px solid #d9d5e5}.num{text-align:right;white-space:nowrap}.totals{margin-left:auto;margin-top:14px;width:310px}.totals div{display:flex;justify-content:space-between;padding:6px 8px;border-bottom:1px solid #ddd}.totals .grand{font-size:15px;font-weight:700;background:#eeeaf6;color:#30264a}.notes{margin-top:18px;border-top:1px solid #ddd;padding-top:10px}.footer{margin-top:35px;display:grid;grid-template-columns:1fr 1fr;gap:50px;text-align:center}.signature{border-top:1px solid #555;padding-top:6px;margin-top:35px}@media print{.no-print{display:none!important}}
  </style>
</head>
<body>
  <main class="page">
    <section class="head">
      <div class="brand">
        <h1>${escapeHtml(document.companyName || 'Sistemi Genit')}</h1>
        <p>Sistem ERP Online</p>
      </div>
      <div class="doc-title">
        <h2>${escapeHtml(title)}</h2>
        <p><strong>Nr. ${escapeHtml(document.documentNo || '—')}</strong></p>
        <p>Data: ${escapeHtml(document.documentDate || '—')}</p>
        <span class="status">${escapeHtml(document.status || 'DRAFT')}</span>
      </div>
    </section>
    <section class="cards">
      <div class="card"><h3>${document.docType?.startsWith('PURCHASE') ? 'Furnitori' : 'Klienti'}</h3><p><strong>${escapeHtml(document.partnerName || '—')}</strong></p></div>
      <div class="card"><h3>Magazina</h3><p><strong>${escapeHtml(document.warehouseName || '—')}</strong></p></div>
    </section>
    <table>
      <thead><tr><th>#</th><th>Artikulli / Përshkrimi</th><th>Njësia</th><th>Sasia</th><th>Dhuratë</th><th>Çmimi</th><th>TVSH</th><th>Vlera</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8">Nuk ka rreshta.</td></tr>'}</tbody>
    </table>
    <section class="totals">
      <div><span>Neto</span><strong>${money(document.totalNet)} ALL</strong></div>
      <div><span>TVSH</span><strong>${money(document.totalVat)} ALL</strong></div>
      <div class="grand"><span>Totali</span><strong>${money(document.totalAmount)} ALL</strong></div>
    </section>
    ${document.notes ? `<section class="notes"><strong>Shënime:</strong><p>${escapeHtml(document.notes)}</p></section>` : ''}
    <section class="footer"><div><div class="signature">Përgatiti</div></div><div><div class="signature">Pranoi</div></div></section>
  </main>
</body>
</html>`;
}

function openDocumentWindow(document, fallbackTitle, autoPrint = false) {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Browseri bllokoi dritaren e dokumentit. Lejo pop-up për këtë faqe.');
  popup.document.open();
  popup.document.write(buildDocumentHtml(document, fallbackTitle));
  popup.document.close();
  if (autoPrint) {
    popup.addEventListener('load', () => {
      popup.focus();
      popup.print();
    }, { once: true });
  }
  return popup;
}

export function previewDocument(document, fallbackTitle) {
  return openDocumentWindow(document, fallbackTitle, false);
}

export function printDocument(document, fallbackTitle) {
  return openDocumentWindow(document, fallbackTitle, true);
}

export async function exportDocumentPdf(rawDocument, fallbackTitle) {
  const document = normalizeDocument(rawDocument);
  const title = documentTitle(document, fallbackTitle);
  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('https://esm.sh/jspdf@2.5.2'),
      import('https://esm.sh/jspdf-autotable@3.8.4'),
    ]);
    const autoTable = autoTableModule.default;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    pdf.setFontSize(18);
    pdf.text(title, 14, 16);
    pdf.setFontSize(10);
    pdf.text(`Nr. ${document.documentNo || '—'}   Data: ${document.documentDate || '—'}   Statusi: ${document.status || 'DRAFT'}`, 14, 23);
    pdf.text(`${document.docType?.startsWith('PURCHASE') ? 'Furnitori' : 'Klienti'}: ${document.partnerName || '—'}`, 14, 29);
    pdf.text(`Magazina: ${document.warehouseName || '—'}`, 14, 35);
    autoTable(pdf, {
      startY: 40,
      head: [['#', 'Artikulli', 'Njësia', 'Sasia', 'Dhuratë', 'Çmimi', 'TVSH', 'Vlera']],
      body: document.items.map((item, index) => [
        index + 1,
        item.description,
        item.unit,
        number(item.quantity),
        number(item.freeQuantity),
        money(item.unitPrice),
        `${number(item.vatRate)}%`,
        money(item.lineTotal || (item.lineNet + item.lineVat)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 63, 120] },
    });
    const endY = pdf.lastAutoTable?.finalY || 50;
    pdf.text(`Neto: ${money(document.totalNet)} ALL`, 135, endY + 8);
    pdf.text(`TVSH: ${money(document.totalVat)} ALL`, 135, endY + 14);
    pdf.setFontSize(12);
    pdf.text(`Totali: ${money(document.totalAmount)} ALL`, 135, endY + 21);
    pdf.save(`${safeFileName(title)}_${safeFileName(document.documentNo)}.pdf`);
  } catch (error) {
    console.error(error);
    printDocument(document, fallbackTitle);
  }
}

export async function exportDocumentXlsx(rawDocument, fallbackTitle) {
  const document = normalizeDocument(rawDocument);
  const title = documentTitle(document, fallbackTitle);
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const sheetRows = [
    [title],
    ['Nr. dokumenti', document.documentNo],
    ['Data', document.documentDate],
    [document.docType?.startsWith('PURCHASE') ? 'Furnitori' : 'Klienti', document.partnerName],
    ['Magazina', document.warehouseName],
    ['Statusi', document.status],
    [],
    ['Nr.', 'Artikulli', 'Njësia', 'Koeficienti', 'Sasia', 'Dhuratë', 'Çmimi', 'TVSH %', 'Vlera'],
    ...document.items.map((item, index) => [
      index + 1,
      item.description,
      item.unit,
      item.coefficient,
      item.quantity,
      item.freeQuantity,
      item.unitPrice,
      item.vatRate,
      item.lineTotal || (item.lineNet + item.lineVat),
    ]),
    [],
    ['', '', '', '', '', '', '', 'Neto', document.totalNet],
    ['', '', '', '', '', '', '', 'TVSH', document.totalVat],
    ['', '', '', '', '', '', '', 'Totali', document.totalAmount],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = [{ wch: 7 }, { wch: 34 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dokumenti');
  XLSX.writeFile(workbook, `${safeFileName(title)}_${safeFileName(document.documentNo)}.xlsx`);
}
