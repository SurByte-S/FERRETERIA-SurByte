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
  unit: string;
  cost: number | null;
  salePrice: number | null;
  minStock: number;
  active: boolean;
  imageUrl: string;
};

export type ProductCatalogOption = {
  id: string;
  name: string;
};
