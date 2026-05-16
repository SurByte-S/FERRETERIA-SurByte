export const PRODUCT_IMPORT_HEADERS = [
  "codigo",
  "sku",
  "descripcion",
  "nombre_normalizado",
  "categoria_sugerida",
  "marca_sugerida",
  "unidad_sugerida",
  "costo_sin_iva_ars",
  "costo_con_iva_ars",
  "precio_publico_ars",
  "iva_pct_inferido",
  "stock_inicial",
  "stock_minimo",
  "activo",
  "origen_excel_fila",
];

export function parseCsvText(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  const cleanText = String(text ?? "").replace(/^\uFEFF/, "");

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const next = cleanText[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows.filter((item) =>
    item.some((value) => String(value).trim().length > 0)
  );

  if (!headers) {
    return { headers: [], rows: [] };
  }

  const cleanHeaders = headers.map((header) => String(header).trim());

  return {
    headers: cleanHeaders,
    rows: dataRows.map((values, index) => ({
      rowNumber: index + 2,
      values: cleanHeaders.reduce((acc, header, valueIndex) => {
        acc[header] = String(values[valueIndex] ?? "").trim();
        return acc;
      }, {}),
    })),
  };
}

export function validateRequiredHeaders(headers) {
  const available = new Set(headers);
  return PRODUCT_IMPORT_HEADERS.filter((header) => !available.has(header));
}
