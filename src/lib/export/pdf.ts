type PdfTable = {
  headers: string[];
  rows: (string | number | null | undefined)[][];
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

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 40;
const TOP = 802;
const LINE_HEIGHT = 16;
const MAX_CHARS = 112;

export function createSimplePdf(document: SimplePdfDocument) {
  const lines = buildDocumentLines(document);
  const pages = paginate(lines);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids ${pages
      .map((_, index) => `${3 + index * 2} 0 R`)
      .join(" ")} /Count ${pages.length} >>`
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
  const buffer = Buffer.alloc(2 + value.length * 2);
  buffer[0] = 0xfe;
  buffer[1] = 0xff;

  for (let index = 0; index < value.length; index += 1) {
    buffer.writeUInt16BE(value.charCodeAt(index), 2 + index * 2);
  }

  return `<${buffer.toString("hex").toUpperCase()}>`;
}
