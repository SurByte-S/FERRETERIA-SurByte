"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Printer, ShoppingCart } from "lucide-react";

import { convertQuoteToSaleAction } from "@/app/(dashboard)/presupuestos/[id]/actions";
import { Button } from "@/components/ui/button";
import { formatStockQuantity } from "@/lib/format";

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];

type StockWarning = {
  name: string;
  sku: string | null;
  currentStock: number;
  requestedQuantity: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export function PrintQuoteButton() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      window.print();
    }
  }, [searchParams]);

  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="h-14 gap-2 px-6 text-lg"
    >
      <Printer className="size-6" aria-hidden="true" />
      Imprimir presupuesto
    </Button>
  );
}

export function ConvertQuoteButton({
  quoteId,
  total,
  initialCustomerId,
  customers,
  disabled,
  stockWarnings = [],
}: {
  quoteId: string;
  total: number;
  initialCustomerId?: string | null;
  customers: { id: string; name: string }[];
  disabled: boolean;
  stockWarnings?: StockWarning[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paidAmount, setPaidAmount] = useState(String(total));
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function convert() {
    const amount = Number(paidAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Revisa el monto pagado.");
      return;
    }

    const confirmed = window.confirm(
      `Vas a convertir este presupuesto en venta con pago ${paymentMethod} por ${formatMoney(amount)}. Queres continuar?`
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      const result = await convertQuoteToSaleAction({
        quoteId,
        customerId,
        paymentMethod,
        paidAmount: amount,
      });

      if (result.ok && result.saleId) {
        router.push(`/ventas/${result.saleId}`);
        return;
      }

      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <label className="grid gap-2 text-base font-semibold">
        <span>Cliente de la venta</span>
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          disabled={disabled || pending}
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        >
          <option value="">Sin cliente</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>

      {paymentMethod === "Cuenta corriente" ? (
        <p className="rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-base font-semibold text-yellow-900">
          Esta venta queda anotada en cuenta corriente.
        </p>
      ) : null}

      <label className="grid gap-2 text-base font-semibold">
        <span>Forma de pago</span>
        <select
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value)}
          disabled={disabled || pending}
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-base font-semibold">
        <span>Monto pagado</span>
        <input
          value={paidAmount}
          onChange={(event) => setPaidAmount(event.target.value)}
          disabled={disabled || pending}
          type="number"
          min="0"
          step="0.01"
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>

      <Button
        type="button"
        onClick={convert}
        disabled={disabled || pending}
        className="h-14 gap-2 px-6 text-lg"
      >
        <ShoppingCart className="size-6" aria-hidden="true" />
        {pending ? "Convirtiendo..." : "Convertir en venta"}
      </Button>
      {stockWarnings.length > 0 ? (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm text-yellow-900">
          <p className="font-semibold">
            Atencion: esta venta puede dejar productos con stock negativo.
          </p>
          <ul className="mt-2 grid gap-1">
            {stockWarnings.slice(0, 5).map((item) => (
              <li key={`${item.sku ?? item.name}-${item.requestedQuantity}`}>
                {item.name}: stock {formatStockQuantity(item.currentStock)}, pedido{" "}
                {formatStockQuantity(item.requestedQuantity)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? <p className="text-base font-semibold">{message}</p> : null}
    </div>
  );
}
