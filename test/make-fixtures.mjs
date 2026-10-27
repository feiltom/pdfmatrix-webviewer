// Writes the PDF fixtures used by the tests. Run with `make fixtures` (in podman).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Minimal PDF writer: `objects` are bodies (strings or Buffers) numbered from 1. */
const writePdf = (file, objects) => {
    const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets = [];
    let length = chunks[0].length;
    objects.forEach((body, i) => {
        offsets.push(length);
        const parts = [Buffer.from(`${i + 1} 0 obj\n`), Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'), Buffer.from('\nendobj\n')];
        for (const p of parts) {
            chunks.push(p);
            length += p.length;
        }
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
    writeFileSync(join(dir, file), Buffer.concat(chunks));
};

const stream = (dict, data) => {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    return Buffer.concat([Buffer.from(`<< ${dict} /Length ${bytes.length} >>\nstream\n`), bytes, Buffer.from('\nendstream')]);
};

const text = (lines) => lines.map(([x, y, size, s]) => `BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`).join('\n');

// multi.pdf: three pages of different sizes; the third has /Rotate 90.
writePdf('multi.pdf', [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    stream('', text([[72, 720, 24, 'Hello PDFMatrix WebViewer'], [72, 680, 14, 'Second line of text on page one']])),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>',
    stream('', text([[72, 770, 20, 'Page two']])),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Rotate 90 /Resources << /Font << /F1 3 0 R >> >> /Contents 9 0 R >>',
    stream('', text([[72, 720, 20, 'Rotated page']])),
]);

// jpx.pdf: a JPEG 2000 image, decoded by pdf.js' openjpeg wasm module.
const jp2 = readFileSync(join(dir, 'halves.jp2'));
writePdf('jpx.pdf', [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    stream('', 'q 320 0 0 240 40 30 cm /Im1 Do Q'),
    stream('/Type /XObject /Subtype /Image /Width 64 /Height 48 /Filter /JPXDecode', jp2),
]);

console.log('fixtures written to', dir);
