import { parseCsv } from "@/lib/csv/productos";

export type StockCsvInputRow = {
  rowNumber: number;
  codigo: string;
  cantidadText: string;
  cantidad: number | null;
  errors: string[];
};

export type ConsolidatedStockCsvRow = {
  codigo: string;
  cantidad: number;
  sourceRows: number[];
};

export function parseStockCsv(text: string) {
  const rows = parseCsv(text);
  const firstRow = rows[0] ?? {};
  const missingHeaders = ["codigo", "cantidad"].filter(
    (header) => !(header in firstRow)
  );

  const parsedRows: StockCsvInputRow[] = rows.map((row, index) => {
    const codigo = String(row.codigo ?? "").trim();
    const cantidadText = String(row.cantidad ?? "").trim();
    const cantidad = parseStockQuantity(cantidadText);
    const errors: string[] = [];

    if (!codigo) {
      errors.push("Codigo obligatorio.");
    }

    if (!cantidadText) {
      errors.push("Cantidad obligatoria.");
    } else if (cantidad === null) {
      errors.push("Cantidad invalida.");
    } else if (cantidad <= 0) {
      errors.push("La cantidad debe ser mayor a 0.");
    }

    return {
      rowNumber: index + 2,
      codigo,
      cantidadText,
      cantidad,
      errors,
    };
  });

  return {
    missingHeaders,
    rows: parsedRows,
    consolidatedRows: consolidateStockRows(parsedRows),
  };
}

function parseStockQuantity(value: string) {
  if (!value.trim()) {
    return null;
  }

  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function consolidateStockRows(rows: StockCsvInputRow[]) {
  const consolidated = new Map<string, ConsolidatedStockCsvRow>();

  for (const row of rows) {
    if (row.errors.length > 0 || row.cantidad === null || row.cantidad <= 0) {
      continue;
    }

    const current = consolidated.get(row.codigo);

    if (current) {
      current.cantidad += row.cantidad;
      current.sourceRows.push(row.rowNumber);
    } else {
      consolidated.set(row.codigo, {
        codigo: row.codigo,
        cantidad: row.cantidad,
        sourceRows: [row.rowNumber],
      });
    }
  }

  return Array.from(consolidated.values());
}
