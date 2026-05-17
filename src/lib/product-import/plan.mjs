import { isMeaningfulBarcode } from "./normalize.mjs";

export function buildImportPlan({
  sourceName,
  tenantId,
  validation,
  existingProducts,
}) {
  const existingBySku = new Map();
  const existingByBarcode = new Map();
  const errors = [...validation.errors];
  const conflicts = [...validation.conflicts];
  const newRows = [];
  const updateRows = [];

  for (const product of existingProducts) {
    if (product.sku) {
      existingBySku.set(product.sku, product);
    }

    if (isMeaningfulBarcode(product.barcode) && !existingByBarcode.has(product.barcode)) {
      existingByBarcode.set(product.barcode, product);
    }
  }

  const rows = [];

  for (const row of validation.rows) {
    const existingWithSku = existingBySku.get(row.sku);
    const existingWithBarcode = isMeaningfulBarcode(row.codigo)
      ? existingByBarcode.get(row.codigo)
      : null;

    if (existingWithBarcode && existingWithBarcode.sku !== row.sku) {
      const conflict = {
        rowNumber: row.rowNumber,
        sku: row.sku,
        codigo: row.codigo,
        messages: [
          `conflicto contra base: el codigo ${row.codigo} ya existe con sku ${existingWithBarcode.sku}.`,
        ],
      };
      conflicts.push(conflict);
      errors.push(conflict);
      continue;
    }

    rows.push(row);

    if (existingWithSku) {
      updateRows.push(row);
    } else {
      newRows.push(row);
    }
  }

  return {
    sourceName,
    tenantId,
    totalRows: validation.allRows.length,
    rows,
    newRows,
    updateRows,
    errors,
    duplicateSkus: validation.duplicateSkus,
    duplicateCodigos: validation.duplicateCodigos,
    conflicts,
  };
}
