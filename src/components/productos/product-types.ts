export type ProductListItem = {
  sku: string;
  code: string;
  description: string;
  category: string;
  brand: string;
  unit: string;
  cost: number | null;
  salePrice: number | null;
  stock: number;
  minStock: number;
  active: boolean;
};

export type ProductCatalogOption = {
  name: string;
};
