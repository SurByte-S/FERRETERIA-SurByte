export type CsvValue = string | number | boolean | null | undefined;

export function createCsv(headers: string[], rows: CsvValue[][]) {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

function escapeCsvValue(value: CsvValue) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function csvResponse({
  csv,
  filename,
}: {
  csv: string;
  filename: string;
}) {
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
