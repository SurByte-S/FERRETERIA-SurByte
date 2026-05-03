import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { cleanString, isJunkRow } from './lib/normalizers.js';

const FILE_PATH = process.env.EXCEL_PATH || 'data/imports/LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm';

if (!fs.existsSync(FILE_PATH)) {
  console.error(`Archivo no encontrado: ${FILE_PATH}`);
  process.exit(1);
}

const wb = xlsx.readFile(FILE_PATH, { cellDates: false });
const out = {
  file_path: path.resolve(FILE_PATH),
  file_name: path.basename(FILE_PATH),
  sheets: []
};

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const range = xlsx.utils.decode_range(ws['!ref'] || 'A1:A1');
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const nonEmpty = rows.filter((r) => r.some((c) => cleanString(c)));
  const useful = nonEmpty.slice(0, 8);

  const guessedType = /catalog|catalogo/i.test(name)
    ? 'catalog'
    : /presupuesto/i.test(name)
      ? 'budget'
      : 'unknown';

  let junkCount = 0;
  for (const r of nonEmpty) {
    const rowObj = Object.fromEntries(r.map((v, i) => [`c${i + 1}`, v]));
    if (isJunkRow(rowObj)) junkCount++;
  }

  out.sheets.push({
    sheet: name,
    guessed_type: guessedType,
    row_count: rows.length,
    column_count: range.e.c + 1,
    non_empty_rows: nonEmpty.length,
    potential_junk_rows: junkCount,
    merged_ranges: (ws['!merges'] || []).map((m) => xlsx.utils.encode_range(m)),
    first_useful_rows: useful
  });
}

console.log(JSON.stringify(out, null, 2));
