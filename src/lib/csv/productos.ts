export type ProductCsvRow = {
  codigo: string;
  sku: string;
  descripcion: string;
  nombre_normalizado: string;
  categoria_sugerida: string;
  marca_sugerida: string;
  unidad_sugerida: string;
  costo_sin_iva_ars: string;
  costo_con_iva_ars: string;
  precio_publico_ars: string;
  iva_pct_inferido: string;
  stock_inicial: string;
  stock_minimo: string;
  activo: string;
  origen_excel_fila: string;
};

export type ProductCsvPreviewRow = ProductCsvRow & {
  rowNumber: number;
  status: "lista" | "revisar";
  messages: string[];
};

const expectedHeaders = [
  "sku",
  "descripcion",
  "nombre_normalizado",
  "categoria_sugerida",
  "marca_sugerida",
  "unidad_sugerida",
  "costo_sin_iva_ars",
  "costo_con_iva_ars",
  "precio_publico_ars",
] as const;

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

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
    item.some((value) => value.trim().length > 0)
  );

  if (!headers) {
    return [];
  }

  return dataRows.map((values) =>
    headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header.trim()] = (values[index] ?? "").trim();
      return acc;
    }, {})
  );
}

export function validateProductCsvHeaders(rows: Record<string, string>[]) {
  const firstRow = rows[0] ?? {};
  return expectedHeaders.filter((header) => !(header in firstRow));
}

export function toProductCsvRow(row: Record<string, string>): ProductCsvRow {
  return {
    codigo: row.codigo ?? "",
    sku: row.sku ?? "",
    descripcion: row.descripcion ?? "",
    nombre_normalizado: row.nombre_normalizado ?? "",
    categoria_sugerida: row.categoria_sugerida ?? "",
    marca_sugerida: row.marca_sugerida ?? "",
    unidad_sugerida: row.unidad_sugerida ?? "",
    costo_sin_iva_ars: row.costo_sin_iva_ars ?? "",
    costo_con_iva_ars: row.costo_con_iva_ars ?? "",
    precio_publico_ars: row.precio_publico_ars ?? "",
    iva_pct_inferido: row.iva_pct_inferido ?? "",
    stock_inicial: row.stock_inicial ?? "",
    stock_minimo: row.stock_minimo ?? "",
    activo: row.activo ?? "",
    origen_excel_fila: row.origen_excel_fila ?? "",
  };
}

export function buildProductPreviewRows(text: string): ProductCsvPreviewRow[] {
  return parseCsv(text)
    .slice(0, 20)
    .map((row, index) => validateProductCsvRow(toProductCsvRow(row), index + 2));
}

export function validateProductCsvRow(
  row: ProductCsvRow,
  rowNumber: number
): ProductCsvPreviewRow {
  const messages: string[] = [];

  if (!row.sku) {
    messages.push("Falta SKU");
  }

  if (!row.descripcion) {
    messages.push("Falta descripcion");
  }

  if (!row.costo_sin_iva_ars || !row.costo_con_iva_ars || !row.precio_publico_ars) {
    messages.push("Precio o costo para revisar");
  }

  return {
    ...row,
    rowNumber,
    status: messages.length > 0 ? "revisar" : "lista",
    messages,
  };
}

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function parseNullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBoolean(value: string) {
  return !["false", "0", "no", "inactivo"].includes(value.trim().toLowerCase());
}
