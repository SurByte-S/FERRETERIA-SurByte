export type QuoteProduct = {
  sku: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  price: number;
  stockQuantity: number;
  minStock: number;
  availableForSale: boolean;
};

export type QuoteLine = QuoteProduct & {
  quantity: number;
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
