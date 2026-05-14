import { QuickSale } from "@/components/pos/quick-sale";
import type {
  QuoteCustomerOption,
} from "@/components/presupuestos/quote-types";

export function NewQuoteForm({
  initialSku,
  customers,
}: {
  initialSku?: string;
  customers: QuoteCustomerOption[];
}) {
  return <QuickSale initialSku={initialSku} customers={customers} />;
}
