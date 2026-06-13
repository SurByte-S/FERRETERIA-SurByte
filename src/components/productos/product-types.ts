export type ProductSaleUnit = {
  id: string;
  name: string;
  quantityInBaseUnit: number;
  salePrice: number;
  barcode: string;
  isDefault: boolean;
  active: boolean;
};

export type ProductListItem = {
  id: string;
  sku: string;
  code: string;
  displayCode: string;
  barcode: string;
  productBarcode: string;
  hasProductBarcode: boolean;
  description: string;
  name: string;
  category: string;
  categoryId: string;
  brand: string;
  brandId: string;
  supplier: string;
  supplierId: string;
  unit: string;
  cost: number | null;
  costWithoutTax: number | null;
  costWithTax: number | null;
  taxRate: number;
  profitMarginPercent: number;
  salePrice: number | null;
  stockQuantity: number;
  minStock: number;
  active: boolean;
  imageUrl: string;
  matchedBy?: "sku" | "product_barcode" | "sale_unit_barcode" | "text";
  matchedSaleUnitId?: string;
  saleUnits: ProductSaleUnit[];
};

export type ProductCatalogOption = {
  id: string;
  name: string;
};
