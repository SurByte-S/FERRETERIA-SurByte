import {
  DEFAULT_BRAND,
  DEFAULT_CATEGORY,
  DEFAULT_UNIT,
  isMeaningfulBarcode,
  normalizeBarcode,
  normalizeName,
  normalizeText,
  parseNullableInteger,
  parseNumberWithDefault,
  parseRequiredNumber,
  parseStrictBoolean,
} from "./normalize.mjs";

export function normalizeImportRow(rawRow) {
  const row = rawRow.values;
  const errors = [];
  const sku = normalizeText(row.sku);
  const descripcion = normalizeText(row.descripcion);
  const categoria = normalizeText(row.categoria_sugerida) || DEFAULT_CATEGORY;
  const marca = normalizeText(row.marca_sugerida) || DEFAULT_BRAND;
  const unidad = normalizeText(row.unidad_sugerida) || DEFAULT_UNIT;
  const codigo = normalizeBarcode(row.codigo);

  if (!sku) {
    errors.push("sku es requerido.");
  }

  if (!descripcion) {
    errors.push("descripcion es requerida.");
  }

  const normalized = {
    rowNumber: rawRow.rowNumber,
    codigo,
    sku,
    descripcion,
    nombreNormalizado:
      normalizeText(row.nombre_normalizado) || normalizeName(descripcion),
    categoriaSugerida: categoria,
    marcaSugerida: marca,
    unidadSugerida: unidad,
    costoSinIvaArs: parseNumberWithDefault(
      row.costo_sin_iva_ars,
      0,
      "costo_sin_iva_ars",
      errors
    ),
    costoConIvaArs: parseNumberWithDefault(
      row.costo_con_iva_ars,
      0,
      "costo_con_iva_ars",
      errors
    ),
    precioPublicoArs: parseRequiredNumber(
      row.precio_publico_ars,
      "precio_publico_ars",
      errors
    ),
    ivaPctInferido: parseRequiredNumber(row.iva_pct_inferido, "iva_pct_inferido", errors, {
      min: 0,
      max: 100,
    }),
    stockInicial: parseNumberWithDefault(
      row.stock_inicial,
      0,
      "stock_inicial",
      errors,
      { min: 0 }
    ),
    stockMinimo: parseNumberWithDefault(
      row.stock_minimo,
      0,
      "stock_minimo",
      errors,
      { min: 0 }
    ),
    activo: parseStrictBoolean(row.activo, errors),
    origenExcelFila: parseNullableInteger(
      row.origen_excel_fila,
      "origen_excel_fila",
      errors
    ),
  };

  return { row: normalized, errors };
}

export function validateRows(rawRows) {
  const normalizedRows = [];
  const errors = [];
  const skuRows = new Map();
  const codigoRows = new Map();
  const codigoSkuRows = new Map();
  const duplicateSkus = new Set();
  const duplicateCodigos = new Set();
  const conflicts = [];

  for (const rawRow of rawRows) {
    const result = normalizeImportRow(rawRow);
    normalizedRows.push(result.row);

    if (result.errors.length > 0) {
      errors.push({
        rowNumber: result.row.rowNumber,
        sku: result.row.sku,
        codigo: result.row.codigo,
        messages: result.errors,
      });
    }

    if (result.row.sku) {
      const seenRows = skuRows.get(result.row.sku) ?? [];
      seenRows.push(result.row.rowNumber);
      skuRows.set(result.row.sku, seenRows);

      if (seenRows.length > 1) {
        duplicateSkus.add(result.row.sku);
      }
    }

    if (isMeaningfulBarcode(result.row.codigo)) {
      const seenRows = codigoRows.get(result.row.codigo) ?? [];
      seenRows.push(result.row.rowNumber);
      codigoRows.set(result.row.codigo, seenRows);

      if (seenRows.length > 1) {
        duplicateCodigos.add(result.row.codigo);
      }

      const skusForCodigo = codigoSkuRows.get(result.row.codigo) ?? new Set();
      skusForCodigo.add(result.row.sku);
      codigoSkuRows.set(result.row.codigo, skusForCodigo);
    }
  }

  for (const [sku, rows] of skuRows.entries()) {
    if (rows.length > 1) {
      for (const rowNumber of rows) {
        errors.push({
          rowNumber,
          sku,
          messages: [`sku duplicado dentro del CSV: ${sku}.`],
        });
      }
    }
  }

  for (const [codigo, rows] of codigoRows.entries()) {
    if (rows.length > 1) {
      for (const rowNumber of rows) {
        errors.push({
          rowNumber,
          codigo,
          messages: [`codigo duplicado dentro del CSV: ${codigo}.`],
        });
      }
    }
  }

  for (const [codigo, skus] of codigoSkuRows.entries()) {
    if (skus.size > 1) {
      const conflict = {
        rowNumber: 0,
        codigo,
        messages: [
          `conflicto: el codigo ${codigo} aparece asociado a distintos sku: ${Array.from(
            skus
          ).join(", ")}.`,
        ],
      };
      conflicts.push(conflict);
      errors.push(conflict);
    }
  }

  const blockedRows = new Set(
    errors.filter((error) => error.rowNumber > 0).map((error) => error.rowNumber)
  );

  return {
    rows: normalizedRows.filter((row) => !blockedRows.has(row.rowNumber)),
    allRows: normalizedRows,
    errors,
    duplicateSkus: Array.from(duplicateSkus),
    duplicateCodigos: Array.from(duplicateCodigos),
    conflicts,
  };
}
