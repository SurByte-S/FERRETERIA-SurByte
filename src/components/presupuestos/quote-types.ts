export type ProductSaleUnit = {
  id: string;
  name: string;
  quantityInBaseUnit: number;
  salePrice: number;
  barcode: string;
  isDefault: boolean;
  active: boolean;
};

export type QuoteProduct = {
  id: string;
  sku: string;
  code: string;
  displayCode: string;
  productBarcode: string;
  name: string;
  description: string;
  brand?: string;
  category?: string;
  unit: string;
  price: number;
  stockQuantity: number;
  minStock: number;
  availableForSale: boolean;
  hasProductBarcode: boolean;
  matchedBy: "sku" | "product_barcode" | "sale_unit_barcode" | "text";
  matchedSaleUnitId?: string;
  saleUnits: ProductSaleUnit[];
};

export type QuoteLine = QuoteProduct & {
  quantity: number;
  selectedSaleUnitId: string;
  selectedSaleUnitName: string;
  quantityInBaseUnit: number;
};

export type QuoteCustomer = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type QuoteCustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};
