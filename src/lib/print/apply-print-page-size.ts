import type { PrintPaperSize } from "@/lib/print/invoice-settings";

const PRINT_PAGE_STYLE_ID = "dynamic-print-page-size";

function pageSizeCss(printPaperSize: PrintPaperSize | null | undefined) {
  if (printPaperSize === "a5") {
    return `
@page {
  size: A5 portrait;
  margin: 8mm;
}
`;
  }

  if (printPaperSize === "ticket_80mm") {
    return `
@page {
  /* Browser and thermal printer drivers may handle roll length differently. */
  size: 80mm auto;
  margin: 4mm;
}
`;
  }

  return `
@page {
  size: A4 portrait;
  margin: 12mm;
}
`;
}

function removeExistingPrintPageStyle() {
  document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
}

export function printWithPageSize(printPaperSize: PrintPaperSize = "a4") {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  removeExistingPrintPageStyle();

  const style = document.createElement("style");
  style.id = PRINT_PAGE_STYLE_ID;
  style.textContent = pageSizeCss(printPaperSize);
  document.head.appendChild(style);

  let cleanupTimeout: number | null = null;
  const cleanup = () => {
    if (cleanupTimeout) {
      window.clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }

    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  cleanupTimeout = window.setTimeout(cleanup, 5000);
  window.print();
}
