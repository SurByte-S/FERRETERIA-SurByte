export type QuoteProduct = {
  sku: string;
  code: string;
  description: string;
  unit: string;
  price: number;
};

export type QuoteLine = QuoteProduct & {
  quantity: number;
};
