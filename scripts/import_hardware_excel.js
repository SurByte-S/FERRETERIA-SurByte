import fs from 'fs';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import pg from 'pg';
import { cleanString, normalizeCode, parseArNumber, parseIVA, isJunkRow } from './lib/normalizers.js';

dotenv.config();

const FILE_PATH = process.env.EXCEL_PATH || 'data/imports/LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm';
const SHEET_NAME = process.env.CATALOG_SHEET || 'CATALOGO';
const TENANT_ID = process.env.TENANT_ID;

if (!TENANT_ID) throw new Error('Falta TENANT_ID');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
if (!fs.existsSync(FILE_PATH)) throw new Error(`No existe el archivo: ${FILE_PATH}`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const HEADER_MAP = {
  codigo: 'code',
  descripción: 'description',
  descripcion: 'description',
  'costo sin iva': 'cost_without_tax',
  'costo c/iva': 'cost_with_tax',
  'costo con iva': 'cost_with_tax',
  iva: 'tax_rate',
  'precio publico': 'public_price',
  cantidad: 'stock_qty',
  stock: 'stock_qty',
  descuento: 'discount_raw',
  marca: 'brand_name',
  categoria: 'category_name',
  rubro: 'category_name',
  unidad: 'unit'
};

function normalizeHeader(h) {
  return cleanString(h)?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ?? null;
}

(async () => {
  await client.connect();
  await client.query('begin');
  const job = await client.query(
    `insert into import_jobs (tenant_id, source_filename, status) values ($1,$2,'processing') returning id`,
    [TENANT_ID, FILE_PATH]
  );
  const importJobId = job.rows[0].id;

  try {
    const wb = xlsx.readFile(FILE_PATH);
    const ws = wb.Sheets[SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

    let headerRowIdx = -1;
    let mappedHeaders = [];
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i].map(normalizeHeader);
      const map = row.map((h) => HEADER_MAP[h] || null);
      if (map.filter(Boolean).length >= 4) {
        headerRowIdx = i;
        mappedHeaders = map;
        break;
      }
    }
    if (headerRowIdx < 0) throw new Error('No se encontró encabezado válido');

    let ok = 0; let err = 0; let total = 0;
    const seen = new Set();

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      total++;
      const values = rows[r];
      const rowObj = {};
      mappedHeaders.forEach((field, c) => {
        if (field) rowObj[field] = values[c];
      });

      if (isJunkRow(rowObj)) continue;

      const code = normalizeCode(rowObj.code);
      const description = cleanString(rowObj.description);
      if (!code || !description) {
        err++;
        await client.query(`insert into import_job_errors (import_job_id, tenant_id, row_number, raw_row, error_message)
                            values ($1,$2,$3,$4,$5)`, [importJobId, TENANT_ID, r + 1, JSON.stringify(values), 'Código o descripción faltante']);
        continue;
      }
      if (seen.has(code)) {
        err++;
        await client.query(`insert into import_job_errors (import_job_id, tenant_id, row_number, raw_row, error_message)
                            values ($1,$2,$3,$4,$5)`, [importJobId, TENANT_ID, r + 1, JSON.stringify(values), 'Código duplicado dentro del archivo']);
        continue;
      }
      seen.add(code);

      const brandName = cleanString(rowObj.brand_name);
      const categoryName = cleanString(rowObj.category_name);
      let brandId = null; let categoryId = null;

      if (brandName) {
        const b = await client.query(`insert into brands (tenant_id,name) values ($1,$2)
          on conflict (tenant_id,name) do update set name=excluded.name returning id`, [TENANT_ID, brandName]);
        brandId = b.rows[0].id;
      }
      if (categoryName) {
        const c = await client.query(`insert into categories (tenant_id,name) values ($1,$2)
          on conflict (tenant_id,name) do update set name=excluded.name returning id`, [TENANT_ID, categoryName]);
        categoryId = c.rows[0].id;
      }

      await client.query(`
        insert into products (
          tenant_id, code, description, brand_id, category_id,
          cost_without_tax, cost_with_tax, tax_rate, public_price, stock_qty,
          raw_discount, unit, source_row_number, source_sheet
        ) values (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10,
          $11,$12,$13,$14
        )
        on conflict (tenant_id, code) do update set
          description=excluded.description,
          brand_id=excluded.brand_id,
          category_id=excluded.category_id,
          cost_without_tax=excluded.cost_without_tax,
          cost_with_tax=excluded.cost_with_tax,
          tax_rate=excluded.tax_rate,
          public_price=excluded.public_price,
          stock_qty=excluded.stock_qty,
          raw_discount=excluded.raw_discount,
          unit=excluded.unit,
          source_row_number=excluded.source_row_number,
          source_sheet=excluded.source_sheet,
          updated_at=now()
      `, [
        TENANT_ID, code, description, brandId, categoryId,
        parseArNumber(rowObj.cost_without_tax),
        parseArNumber(rowObj.cost_with_tax),
        parseIVA(rowObj.tax_rate),
        parseArNumber(rowObj.public_price),
        parseArNumber(rowObj.stock_qty),
        cleanString(rowObj.discount_raw),
        cleanString(rowObj.unit),
        r + 1, SHEET_NAME
      ]);
      ok++;
    }

    await client.query(`update import_jobs set status='done', rows_total=$2, rows_ok=$3, rows_error=$4, finished_at=now() where id=$1`, [importJobId, total, ok, err]);
    await client.query('commit');
    console.log({ import_job_id: importJobId, total, ok, err });
  } catch (e) {
    await client.query(`update import_jobs set status='error', finished_at=now(), error_summary=$2 where id=$1`, [importJobId, e.message.slice(0, 1000)]);
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }
})();
