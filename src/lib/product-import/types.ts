export type ProductImportRawRow = Record<string, string>;

export type ProductImportNormalizedRow = {
  rowNumber: number;
  codigo: string | null;
  sku: string;
  descripcion: string;
  nombreNormalizado: string;
  categoriaSugerida: string;
  marcaSugerida: string;
  unidadSugerida: string;
  costoSinIvaArs: number;
  costoConIvaArs: number;
  precioPublicoArs: number;
  ivaPctInferido: number;
  stockInicial: number;
  stockMinimo: number;
  activo: boolean;
  origenExcelFila: number | null;
};

export type ProductImportRowError = {
  rowNumber: number;
  sku?: string;
  codigo?: string | null;
  messages: string[];
};

export type ProductImportPlan = {
  sourceName: string;
  tenantId: string;
  totalRows: number;
  rows: ProductImportNormalizedRow[];
  newRows: ProductImportNormalizedRow[];
  updateRows: ProductImportNormalizedRow[];
  errors: ProductImportRowError[];
  duplicateSkus: string[];
  duplicateCodigos: string[];
  conflicts: ProductImportRowError[];
};
