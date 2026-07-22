import part00 from '../html64-source/xz-00.b64?raw';
import part01 from '../html64-source/xz-01.b64?raw';
import part02 from '../html64-source/xz-02.b64?raw';
import part03 from '../html64-source/xz-03.b64?raw';
import part04 from '../html64-source/xz-04.b64?raw';
import part05 from '../html64-source/xz-05.b64?raw';
import part06 from '../html64-source/xz-06.b64?raw';
import part07 from '../html64-source/xz-07.b64?raw';

const statusBox = document.getElementById('status');
const errorBox = document.getElementById('error');

function decodeBase64(source) {
  const clean = source.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('Burimi Base64 përmban karaktere të pavlefshme.');
  }
  if (clean.length % 4 !== 0) {
    throw new Error(`Burimi Base64 është i paplotë (${clean.length}).`);
  }

  const blockChars = 32768;
  const blocks = [];
  let totalBytes = 0;

  for (let offset = 0; offset < clean.length; offset += blockChars) {
    const segment = clean.slice(offset, Math.min(clean.length, offset + blockChars));
    const binary = window.atob(segment);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    blocks.push(bytes);
    totalBytes += bytes.length;
  }

  const result = new Uint8Array(totalBytes);
  let cursor = 0;
  for (const block of blocks) {
    result.set(block, cursor);
    cursor += block.length;
  }
  return result;
}

async function openSystem() {
  try {
    statusBox.textContent = 'Po bashkohet sistemi…';
    const parts = [part00, part01, part02, part03, part04, part05, part06, part07];
    const sizes = parts.map((part) => part.replace(/\s+/g, '').length);
    if (parts.length !== 8 || sizes.some((size) => size < 1000)) {
      throw new Error(`Burimi është i paplotë: ${sizes.join(', ')}.`);
    }

    const base64 = parts.join('').replace(/\s+/g, '');
    if (!base64.startsWith('/Td6WFoAAA')) {
      throw new Error('Burimi XZ nuk ka firmën e pritshme.');
    }

    statusBox.textContent = 'Po përgatitet sistemi…';
    const packed = decodeBase64(base64);

    const { XzReadableStream } = await import('https://esm.sh/xz-decompress@0.2.3');
    statusBox.textContent = 'Po hapet sistemi…';
    const html = await new Response(
      new XzReadableStream(new Blob([packed]).stream()),
    ).text();

    const lower = html.slice(0, 1000).toLowerCase();
    if (html.length < 1_000_000 || !lower.includes('<!doctype html')) {
      throw new Error(`HTML-ja e rindërtuar është e paplotë (${html.length} bytes).`);
    }

    document.open();
    document.write(html);
    document.close();
  } catch (error) {
    console.error(error);
    statusBox.textContent = 'Ngarkimi dështoi';
    errorBox.style.display = 'block';
    errorBox.textContent = `Sistemi nuk u hap: ${error.message}\nRifresko faqen.`;
  }
}

openSystem();
