const encoder = new TextEncoder();

export function installFetchTimeout(timeoutMs = 15000) {
  if (window.__sgFetchTimeoutInstalled) return;
  window.__sgFetchTimeoutInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const externalSignal = init.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return nativeFetch(input, { ...init, signal: controller.signal })
      .catch((error) => {
        if (error?.name === 'AbortError') {
          throw new Error('Serveri nuk u përgjigj brenda 15 sekondash. Kontrollo genit-api në Railway dhe provo përsëri.');
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timer));
  };
}

function safeName(value = 'eksport') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'eksport';
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function elementTitle(element) {
  return cleanText(element.querySelector('h1,h2,h3')?.textContent || document.title || 'Sistemi Genit');
}

function extractTable(table) {
  const headers = [...table.querySelectorAll('thead th')]
    .map((x) => cleanText(x.textContent))
    .filter((x) => x && x !== 'Eksport');
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll(':scope > td')];
    return cells.slice(0, headers.length).map((x) => cleanText(x.textContent));
  });
  return { headers, rows };
}

function extractRow(table, row) {
  const allHeaders = [...table.querySelectorAll('thead th')].map((x) => cleanText(x.textContent));
  const cells = [...row.querySelectorAll(':scope > td')];
  const headers = [];
  const values = [];
  allHeaders.forEach((header, index) => {
    if (!header || header === 'Eksport') return;
    headers.push(header);
    values.push(cleanText(cells[index]?.textContent));
  });
  return { headers, rows: [values] };
}

function extractForm(element) {
  const headers = ['Fusha', 'Vlera'];
  const rows = [];
  element.querySelectorAll('label').forEach((label) => {
    const name = cleanText(label.querySelector('span,legend')?.textContent);
    const field = label.querySelector('input,select,textarea');
    if (!name || !field) return;
    const value = field.tagName === 'SELECT'
      ? cleanText(field.selectedOptions?.[0]?.textContent)
      : cleanText(field.value);
    rows.push([name, value]);
  });
  return { headers, rows };
}

function extractElement(element) {
  const table = element.querySelector('table');
  if (table) return extractTable(table);
  const formData = extractForm(element);
  if (formData.rows.length) return formData;
  const rows = [...element.querySelectorAll('h1,h2,h3,p,strong,span')]
    .map((x) => cleanText(x.textContent))
    .filter(Boolean)
    .slice(0, 300)
    .map((x) => [x]);
  return { headers: ['Informacion'], rows };
}

function download(bytes, mime, filename) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function le16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function le32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
  const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

  entries.forEach(({ name, content }) => {
    const filename = encoder.encode(name);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);
    const localHeader = concat([
      le32(0x04034B50), le16(20), le16(0), le16(0), le16(dosTime), le16(dosDate),
      le32(crc), le32(data.length), le32(data.length), le16(filename.length), le16(0), filename,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concat([
      le32(0x02014B50), le16(20), le16(20), le16(0), le16(0), le16(dosTime), le16(dosDate),
      le32(crc), le32(data.length), le32(data.length), le16(filename.length), le16(0), le16(0),
      le16(0), le16(0), le32(0), le32(offset), filename,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const central = concat(centralParts);
  const end = concat([
    le32(0x06054B50), le16(0), le16(0), le16(entries.length), le16(entries.length),
    le32(central.length), le32(offset), le16(0),
  ]);
  return concat([...localParts, central, end]);
}

function buildXlsx(data, title) {
  const allRows = [data.headers, ...data.rows];
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${colName(colIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const sheetName = safeName(title).slice(0, 31) || 'Raporti';
  const now = new Date().toISOString();

  return zip([
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'docProps/core.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(title)}</dc:title><dc:creator>Sistemi Genit Cloud</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
    { name: 'docProps/app.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Sistemi Genit Cloud</Application></Properties>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${colName(Math.max(0, data.headers.length - 1))}${Math.max(1, allRows.length)}"/></worksheet>` },
  ]);
}

function winAnsi(value) {
  const map = { 'Ç': 199, 'Ë': 203, 'ç': 231, 'ë': 235, '€': 128, '–': 150, '—': 151, '’': 146, '“': 147, '”': 148 };
  let result = '';
  for (const char of String(value ?? '')) {
    const code = map[char] ?? char.charCodeAt(0);
    result += String.fromCharCode(code <= 255 ? code : 63);
  }
  return result;
}

function pdfEscape(value) {
  return winAnsi(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(value, width = 105) {
  const text = cleanText(value);
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width && line) { lines.push(line); line = word; }
    else line = candidate;
  });
  if (line) lines.push(line);
  return lines;
}

function buildPdf(data, title) {
  const lines = [title, `Gjeneruar: ${new Date().toLocaleString('sq-AL')}`, ''];
  lines.push(...wrapLine(data.headers.join(' | ')));
  lines.push('-'.repeat(105));
  data.rows.forEach((row) => lines.push(...wrapLine(row.join(' | '))));
  const pages = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  if (!pages.length) pages.push(['Nuk ka të dhëna.']);

  const objects = [];
  const fontId = 3 + pages.length * 2;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;

  pages.forEach((pageLines, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const commands = ['BT', '/F1 9 Tf', '36 806 Td'];
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push('0 -15 Td');
      commands.push(`(${pdfEscape(line)}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${winAnsi(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const binary = winAnsi(pdf);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0) & 255);
}

export function exportElementXlsx(element, filename, title = elementTitle(element)) {
  const data = extractElement(element);
  download(buildXlsx(data, title), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${safeName(filename || title)}.xlsx`);
}

export function exportElementPdf(element, filename, title = elementTitle(element)) {
  const data = extractElement(element);
  download(buildPdf(data, title), 'application/pdf', `${safeName(filename || title)}.pdf`);
}

export function printElement(element, title = elementTitle(element)) {
  const popup = window.open('', '_blank', 'width=1100,height=800');
  if (!popup) throw new Error('Shfletuesi bllokoi dritaren e printimit. Lejo pop-up për këtë faqe.');
  const clone = element.cloneNode(true);
  clone.querySelectorAll('.sg-export-actions,.sg-row-export,button,input,select,textarea').forEach((node) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) {
      const value = node.tagName === 'SELECT' ? node.selectedOptions?.[0]?.textContent : node.value;
      const span = document.createElement('span');
      span.textContent = value || '';
      node.replaceWith(span);
    } else node.remove();
  });
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${xml(title)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1,h2,h3{margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}.section-heading{margin-bottom:14px}.card,.modal{box-shadow:none;border:0}.status-chip{border:1px solid #888;padding:2px 6px;border-radius:10px}@page{size:A4;margin:12mm}</style></head><body><h2>${xml(title)}</h2>${clone.outerHTML}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}<\/script></body></html>`);
  popup.document.close();
}

function button(label, action, className = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `secondary small sg-export-button ${className}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); action(); });
  return btn;
}

function addSectionButtons(element) {
  if (element.dataset.sgExportReady === '1') return;
  const hasInfo = element.querySelector('table,.form-grid,.document-form,.doc-lines');
  if (!hasInfo) return;
  element.dataset.sgExportReady = '1';
  const title = elementTitle(element);
  const actions = document.createElement('div');
  actions.className = 'sg-export-actions';
  actions.append(
    button('PDF', () => exportElementPdf(element, title, title)),
    button('Excel', () => exportElementXlsx(element, title, title)),
    button('Print', () => printElement(element, title)),
  );
  const heading = element.querySelector('.section-heading');
  if (heading) heading.append(actions);
  else element.prepend(actions);
}

function addRowButtons(table) {
  if (table.dataset.sgRowExportReady === '1') return;
  table.dataset.sgRowExportReady = '1';
  const headRow = table.querySelector('thead tr');
  if (!headRow) return;
  const th = document.createElement('th');
  th.textContent = 'Eksport';
  headRow.appendChild(th);
  table.querySelectorAll('tbody tr').forEach((row) => {
    const td = document.createElement('td');
    td.className = 'sg-row-export';
    const title = cleanText(row.querySelector('td:nth-child(2)')?.textContent || elementTitle(table.closest('.card,.modal') || table));
    const rowElement = document.createElement('div');
    const data = extractRow(table, row);
    const makeTemp = () => {
      const temp = document.createElement('div');
      const t = document.createElement('table');
      const trh = document.createElement('tr');
      data.headers.forEach((h) => { const cell = document.createElement('th'); cell.textContent = h; trh.appendChild(cell); });
      const tr = document.createElement('tr');
      data.rows[0].forEach((v) => { const cell = document.createElement('td'); cell.textContent = v; tr.appendChild(cell); });
      const thead = document.createElement('thead'); thead.appendChild(trh);
      const tbody = document.createElement('tbody'); tbody.appendChild(tr);
      t.append(thead, tbody); temp.appendChild(t); return temp;
    };
    rowElement.append(
      button('PDF', () => exportElementPdf(makeTemp(), title, title), 'tiny'),
      button('Excel', () => exportElementXlsx(makeTemp(), title, title), 'tiny'),
      button('Print', () => printElement(makeTemp(), title), 'tiny'),
    );
    td.appendChild(rowElement);
    row.appendChild(td);
  });
}

export function installGlobalExportButtons(root = document) {
  root.querySelectorAll('.card,.modal').forEach(addSectionButtons);
  root.querySelectorAll('table').forEach(addRowButtons);
}
