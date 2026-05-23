export type StockCsvPreviewRow = {
  codigo: string;
  cantidad: number;
  sourceRows: number[];
  productId: string | null;
  productName: string;
  stockActual: number | null;
  stockFinal: number | null;
  status: "ok" | "error";
  message: string;
};

export type StockCsvSummary = {
  updatedProducts: number;
  notFound: number;
  invalidRows: number;
  totalQuantity: number;
};

export type StockCsvState = {
  ok: boolean;
  title: string;
  message: string;
  fileName: string;
  previewRows: StockCsvPreviewRow[];
  invalidRows: {
    rowNumber: number;
    codigo: string;
    cantidad: string;
    message: string;
  }[];
  summary: StockCsvSummary;
  confirmPayload: string;
};

export const initialStockCsvState: StockCsvState = {
  ok: false,
  title: "",
  message: "",
  fileName: "",
  previewRows: [],
  invalidRows: [],
  summary: {
    updatedProducts: 0,
    notFound: 0,
    invalidRows: 0,
    totalQuantity: 0,
  },
  confirmPayload: "",
};
