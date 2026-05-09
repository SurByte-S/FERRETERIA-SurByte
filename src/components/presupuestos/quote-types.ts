export type QuoteProduct = {
  sku: string;
  code: string;
  description: string;
  unit: string;
  price: number;
  stock: number;
};

export type QuoteLine = QuoteProduct & {
  quantity: number;
};

export type QuoteCustomer = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

