type PdfTable = {
  headers: string[];
  rows: (string | number | null | undefined)[][];
};

type PdfTableColumn = {
  align?: "left" | "right" | "center";
  header: string;
  width: number;
};

export type SimplePdfDocument = {
  title: string;
  subtitle?: string;
  meta?: string[];
  sections?: {
    title: string;
    lines: string[];
  }[];
  table?: PdfTable;
};

export type TablePdfDocument = Omit<SimplePdfDocument, "table"> & {
  table: {
    columns: PdfTableColumn[];
    rows: (string | number | null | undefined)[][];
  };
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 40;
const TOP = 802;
const LINE_HEIGHT = 16;
const MAX_CHARS = 112;
const TABLE_LEFT = 32;
const TABLE_RIGHT = 32;
const TABLE_TOP = 802;
const TABLE_BOTTOM = 54;
const TABLE_ROW_HEIGHT = 14;
const TABLE_HEADER_HEIGHT = 16;
const TABLE_FONT_SIZE = 7;
const TABLE_HEADER_FONT_SIZE = 7;

export function createSimplePdf(document: SimplePdfDocument) {
  const lines = buildDocumentLines(document);
  const pages = paginate(lines);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pages
      .map((_, index) => `${3 + index * 2} 0 R`)
      .join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((pageLines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = buildPageContent(pageLines, index + 1, pages.length);

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`);
  });

  return buildPdf(objects);
}

export function createTablePdf(document: TablePdfDocument) {
  const pageCommands = buildTablePageCommands(document);
  const pageContents = pageCommands.map((commands, index) =>
    [...commands, pageFooter(index + 1, pageCommands.length)].join("\n")
  );
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageContents
      .map((_, index) => `${3 + index * 2} 0 R`)
      .join(" ")}] /Count ${pageContents.length} >>`
  );

  pageContents.forEach((content, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`);
  });

  return buildPdf(objects);
}

export function pdfResponse({
  filename,
  pdf,
}: {
  filename: string;
  pdf: Buffer;
}) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/pdf",
    },
  });
}

function buildTablePageCommands(document: TablePdfDocument) {
  const pages: string[][] = [];
  const tableWidth = document.table.columns.reduce(
    (sum, column) => sum + column.width,
    0
  );
  const tableRight = Math.min(TABLE_LEFT + tableWidth, PAGE_WIDTH - TABLE_RIGHT);
  let commands: string[] = [];
  let y = TABLE_TOP;

  function startPage() {
    commands = [];
    pages.push(commands);
    y = TABLE_TOP;
  }

  function ensureSpace(height: number) {
    if (y - height >= TABLE_BOTTOM) {
      return;
    }

    startPage();
    drawTableHeader(commands, document.table.columns, tableRight, y);
    y -= TABLE_HEADER_HEIGHT;
  }

  startPage();
  drawText(commands, document.title, TABLE_LEFT, y, 18, {
    bold: true,
    width: tableRight - TABLE_LEFT,
  });
  y -= 18;

  if (document.subtitle) {
    drawText(commands, document.subtitle, TABLE_LEFT, y, 11, {
      width: tableRight - TABLE_LEFT,
    });
    y -= 14;
  }

  for (const meta of document.meta ?? []) {
    drawText(commands, meta, TABLE_LEFT, y, 9, {
      width: tableRight - TABLE_LEFT,
    });
    y -= 12;
  }

  y -= 6;

  for (const section of document.sections ?? []) {
    ensureSpace(32);
    drawText(commands, section.title, TABLE_LEFT, y, 12, {
      bold: true,
      width: tableRight - TABLE_LEFT,
    });
    y -= 14;

    for (const line of section.lines) {
      ensureSpace(14);
      drawText(commands, line, TABLE_LEFT, y, 9, {
        width: tableRight - TABLE_LEFT,
      });
      y -= 12;
    }

    y -= 6;
  }

  ensureSpace(TABLE_HEADER_HEIGHT + TABLE_ROW_HEIGHT);
  drawTableHeader(commands, document.table.columns, tableRight, y);
  y -= TABLE_HEADER_HEIGHT;

  if (document.table.rows.length === 0) {
    drawText(commands, "Sin datos", TABLE_LEFT, y, TABLE_FONT_SIZE, {
      width: tableRight - TABLE_LEFT,
    });
    return pages;
  }

  for (const row of document.table.rows) {
    ensureSpace(TABLE_ROW_HEIGHT);
    drawTableRow(commands, document.table.columns, row, y);
    y -= TABLE_ROW_HEIGHT;
  }

  return pages;
}

function drawTableHeader(
  commands: string[],
  columns: PdfTableColumn[],
  tableRight: number,
  y: number
) {
  drawHorizontalLine(commands, TABLE_LEFT, y + 5, tableRight);

  let x = TABLE_LEFT;
  for (const column of columns) {
    drawText(commands, column.header, x, y, TABLE_HEADER_FONT_SIZE, {
      align: column.align,
      bold: true,
      width: column.width,
    });
    x += column.width;
  }

  drawHorizontalLine(commands, TABLE_LEFT, y - 6, tableRight);
}

function drawTableRow(
  commands: string[],
  columns: PdfTableColumn[],
  row: (string | number | null | undefined)[],
  y: number
) {
  let x = TABLE_LEFT;

  columns.forEach((column, index) => {
    drawText(commands, cleanCell(row[index]), x, y, TABLE_FONT_SIZE, {
      align: column.align,
      width: column.width,
    });
    x += column.width;
  });
}

function drawText(
  commands: string[],
  value: string,
  x: number,
  y: number,
  size: number,
  options: {
    align?: "left" | "right" | "center";
    bold?: boolean;
    width?: number;
  } = {}
) {
  const font = options.bold ? "F2" : "F1";
  const text = truncateText(value, options.width, size);
  const width = approximateTextWidth(text, size);
  let textX = x;

  if (options.width && options.align === "right") {
    textX = x + options.width - width;
  } else if (options.width && options.align === "center") {
    textX = x + (options.width - width) / 2;
  }

  commands.push(
    `BT /${font} ${size} Tf ${formatPdfNumber(textX)} ${formatPdfNumber(y)} Td ${pdfText(text)} Tj ET`
  );
}

function drawHorizontalLine(
  commands: string[],
  x: number,
  y: number,
  x2: number
) {
  commands.push(`0.5 w ${x} ${formatPdfNumber(y)} m ${x2} ${formatPdfNumber(y)} l S`);
}

function pageFooter(page: number, totalPages: number) {
  return `BT /F1 8 Tf ${TABLE_LEFT} 32 Td ${pdfText(`Pagina ${page} de ${totalPages}`)} Tj ET`;
}

function truncateText(value: string, width: number | undefined, size: number) {
  const clean = cleanCell(normalizePdfText(value));

  if (!width) {
    return clean;
  }

  const maxChars = Math.max(1, Math.floor(width / (size * 0.52)));

  if (clean.length <= maxChars) {
    return clean;
  }

  if (maxChars <= 3) {
    return clean.slice(0, maxChars);
  }

  return `${clean.slice(0, maxChars - 3).trimEnd()}...`;
}

function approximateTextWidth(value: string, size: number) {
  return normalizePdfText(value).length * size * 0.52;
}

function formatPdfNumber(value: number) {
  return Number(value.toFixed(2));
}

function buildDocumentLines(document: SimplePdfDocument) {
  const lines: { text: string; bold?: boolean; size?: number }[] = [
    { text: document.title, bold: true, size: 18 },
  ];

  if (document.subtitle) {
    lines.push({ text: document.subtitle, size: 11 });
  }

  for (const meta of document.meta ?? []) {
    lines.push({ text: meta, size: 10 });
  }

  lines.push({ text: "", size: 10 });

  for (const section of document.sections ?? []) {
    lines.push({ text: section.title, bold: true, size: 13 });

    for (const line of section.lines) {
      lines.push(...wrapLine(line).map((text) => ({ text, size: 10 })));
    }

    lines.push({ text: "", size: 10 });
  }

  if (document.table) {
    lines.push({
      text: document.table.headers.join(" | "),
      bold: true,
      size: 9,
    });

    for (const row of document.table.rows) {
      const text = row.map((value) => cleanCell(value)).join(" | ");
      lines.push(...wrapLine(text).map((line) => ({ text: line, size: 8 })));
    }
  }

  return lines;
}

function paginate(lines: { text: string; bold?: boolean; size?: number }[]) {
  const linesPerPage = Math.floor((TOP - 54) / LINE_HEIGHT);
  const pages: typeof lines[] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  return pages.length > 0 ? pages : [[{ text: "Sin datos" }]];
}

function buildPageContent(
  lines: { text: string; bold?: boolean; size?: number }[],
  page: number,
  totalPages: number
) {
  const commands: string[] = [];

  lines.forEach((line, index) => {
    const y = TOP - index * LINE_HEIGHT;
    const font = line.bold ? "F2" : "F1";
    const size = line.size ?? 10;

    commands.push(`BT /${font} ${size} Tf ${LEFT} ${y} Td ${pdfText(line.text)} Tj ET`);
  });

  commands.push(
    `BT /F1 8 Tf ${LEFT} 32 Td ${pdfText(`Pagina ${page} de ${totalPages}`)} Tj ET`
  );

  return commands.join("\n");
}

function buildPdf(objects: string[]) {
  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  let length = Buffer.byteLength(chunks[0], "binary");

  objects.forEach((object, index) => {
    const entry = `${index + 1} 0 obj\n${object}\nendobj\n`;
    offsets.push(length);
    chunks.push(entry);
    length += Buffer.byteLength(entry, "binary");
  });

  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ].join("\n");

  chunks.push(xref);
  return Buffer.from(chunks.join(""), "binary");
}

function cleanCell(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function wrapLine(line: string) {
  const clean = line.trim();

  if (clean.length <= MAX_CHARS) {
    return [clean];
  }

  const parts: string[] = [];
  let remaining = clean;

  while (remaining.length > MAX_CHARS) {
    let splitAt = remaining.lastIndexOf(" ", MAX_CHARS);

    if (splitAt < 24) {
      splitAt = MAX_CHARS;
    }

    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}

function pdfText(value: string) {
  return `(${escapePdfString(normalizePdfText(value))})`;
}

function normalizePdfText(value: string) {
  return String(value)
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/°/g, "nro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfString(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}
