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
  barcode: string;
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
  salePrice: number | null;
  stockQuantity: number;
  minStock: number;
  active: boolean;
  imageUrl: string;
  saleUnits: ProductSaleUnit[];
};

export type ProductCatalogOption = {
  id: string;
  name: string;
};
