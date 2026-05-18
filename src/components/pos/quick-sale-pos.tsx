"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  getQuoteProductBySkuAction,
  saveQuoteAction,
  saveQuoteAndConvertToSaleAction,
  searchQuoteProductsAction,
} from "@/app/(dashboard)/presupuestos/nuevo/actions";
import type {
  QuoteCustomer,
  QuoteCustomerOption,
  QuoteLine,
  QuoteProduct,
} from "@/components/presupuestos/quote-types";
import { Button } from "@/components/ui/button";
import { formatStockQuantity } from "@/lib/format";

const EMPTY_SEARCH_MESSAGE = "Busca un producto para empezar.";
const SEARCH_PLACEHOLDER = "Codigo, codigo de barras o nombre del producto";
const CASH_REGISTER_CLOSED_MESSAGE = "Para vender necesitas abrir la caja.";

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];

type SaleMode = "sale" | "quote";

type CashStatus =
  | { open: true; openedAt: string; expectedCash: number }
  | { open: false };

function normalizeFormattedText(value: string) {
  return value.replace(/[\s\u00a0\u202f]+/g, " ").trim();
}

function formatMoney(value: number) {
  return normalizeFormattedText(
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    }).format(value)
  );
}

export function QuickSalePos({
  initialSku,
  customers,
  cashStatus,
}: {
  initialSku?: string;
  customers: QuoteCustomerOption[];
  cashStatus?: CashStatus;
}) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [customer, setCustomer] = useState<QuoteCustomer>({
    id: "",
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [search, setSearch] = useState(initialSku ?? "");
  const [mode, setMode] = useState<SaleMode>("sale");
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [message, setMessage] = useState(EMPTY_SEARCH_MESSAGE);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paidAmount, setPaidAmount] = useState("");
  const [isPending, startTransition] = useTransition();

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [lines]
  );
  const hasOutOfStockLines = useMemo(
    () => lines.some((line) => !line.availableForSale),
    [lines]
  );
  const isQuoteMode = mode === "quote";
  const isCashRegisterClosed = !isQuoteMode && cashStatus?.open === false;
  const visibleMessage =
    message && message !== EMPTY_SEARCH_MESSAGE ? message : "";
  const actionHelp = getActionHelp({
    linesCount: lines.length,
    isCashRegisterClosed,
    hasOutOfStockLines,
    isQuoteMode,
  });

  useEffect(() => {
    if (!initialSku) {
      return;
    }

    startTransition(async () => {
      const product = await getQuoteProductBySkuAction(initialSku, isQuoteMode);

      if (product) {
        addProduct(product);
      }
    });
  }, [initialSku, isQuoteMode]);

  useEffect(() => {
    const term = search.trim();

    if (!term) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startTransition(async () => {
        const found = await searchQuoteProductsAction(term, isQuoteMode);

        setResults(found);
        setMessage(
          found.length > 0
            ? "Toca Agregar para sumarlo a la venta."
            : "No encontramos ese producto."
        );
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search, isQuoteMode, startTransition]);

  function changeMode(nextMode: SaleMode) {
    setMode(nextMode);
    setResults([]);
    setMessage(
      nextMode === "quote"
        ? "Modo presupuesto: podes guardar sin cobrar."
        : EMPTY_SEARCH_MESSAGE
    );
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleSearchChange(value: string) {
    setSearch(value);

    if (!value.trim()) {
      setResults([]);
      setMessage(EMPTY_SEARCH_MESSAGE);
    }
  }

  function runSearch() {
    const term = search.trim();

    if (!term) {
      setResults([]);
      setMessage(EMPTY_SEARCH_MESSAGE);
      searchInputRef.current?.focus();
      return;
    }

    setMessage("Buscando productos...");
    startTransition(async () => {
      const exact = await getQuoteProductBySkuAction(term, isQuoteMode);

      if (exact) {
        addProduct(exact);
        return;
      }

      const found = await searchQuoteProductsAction(term, isQuoteMode);

      setResults(found);
      setMessage(
        found.length > 0
          ? "Toca Agregar para sumarlo a la venta."
          : "No encontramos ese producto."
      );
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  }

  function addProduct(product: QuoteProduct) {
    setLines((current) => {
      const existing = current.find((line) => line.sku === product.sku);

      if (existing) {
        return current.map((line) =>
          line.sku === product.sku
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [...current, { ...product, quantity: 1 }];
    });
    setSearch("");
    setResults([]);
    setMessage("Producto agregado a la venta.");
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function incrementLineQuantity(sku: string) {
    setLines((current) =>
      current.map((line) =>
        line.sku === sku ? { ...line, quantity: line.quantity + 1 } : line
      )
    );
  }

  function decrementLineQuantity(sku: string) {
    setLines((current) =>
      current.map((line) =>
        line.sku === sku
          ? { ...line, quantity: Math.max(1, line.quantity - 1) }
          : line
      )
    );
  }

  function removeLine(sku: string) {
    const confirmed = window.confirm(
      "Vas a quitar este producto. Queres continuar?"
    );

    if (!confirmed) {
      return;
    }

    setLines((current) => current.filter((line) => line.sku !== sku));
  }

  function updateCustomer(key: keyof QuoteCustomer, value: string) {
    setCustomer((current) => ({ ...current, [key]: value }));
  }

  function selectCustomer(customerId: string) {
    const selected = customers.find((item) => item.id === customerId);

    if (!selected) {
      setCustomer({
        id: "",
        name: "",
        phone: "",
        email: "",
        address: "",
      });
      return;
    }

    setCustomer({
      id: selected.id,
      name: selected.name,
      phone: selected.phone ?? "",
      email: selected.email ?? "",
      address: selected.address ?? "",
    });
  }

  function saveQuote() {
    setMessage("");
    startTransition(async () => {
      const result = await saveQuoteAction({ customer, lines });

      if (result.ok && result.quoteId) {
        router.push(`/presupuestos/${result.quoteId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  function registerSale() {
    if (isCashRegisterClosed) {
      setMessage(CASH_REGISTER_CLOSED_MESSAGE);
      return;
    }

    if (hasOutOfStockLines) {
      setMessage("Stock insuficiente. Revisa las cantidades antes de vender.");
      return;
    }

    const amount = Number(paidAmount || total);

    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Revisa el monto pagado.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      const result = await saveQuoteAndConvertToSaleAction({
        customer,
        lines,
        paymentMethod,
        paidAmount: amount,
      });

      if (result.ok && result.saleId) {
        router.push(`/ventas/${result.saleId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  return (
    <div className="grid h-auto min-h-0 gap-3 bg-background lg:h-[calc(100vh-6.75rem)] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
      <header className="grid shrink-0 gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-none text-primary">
              Mostrador
            </h1>
            <p className="text-sm font-semibold text-muted-foreground">
              Busca, agrega y cobra.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1">
            <ModeButton
              active={mode === "sale"}
              label="Venta"
              onClick={() => changeMode("sale")}
            />
            <ModeButton
              active={mode === "quote"}
              label="Presupuesto"
              onClick={() => changeMode("quote")}
            />
          </div>
        </div>

        {!isQuoteMode && cashStatus ? <CashBadge cashStatus={cashStatus} /> : null}
      </header>

      <main className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_430px] xl:grid-cols-[minmax(0,1fr)_450px]">
        <section className="grid min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:grid-rows-[auto_minmax(0,1fr)]">
          <div className="border-b border-border p-3">
            <label className="grid gap-1">
              <span className="text-base font-black">Buscar producto</span>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={SEARCH_PLACEHOLDER}
                  className="h-12 w-full rounded-md border-2 border-input bg-background px-4 text-lg font-semibold outline-none focus:border-primary"
                />
                <Button
                  type="button"
                  onClick={runSearch}
                  disabled={isPending || !search.trim()}
                  className="h-12 rounded-md text-lg font-black"
                >
                  Buscar
                </Button>
              </div>
            </label>

            {visibleMessage ? (
              <p className="mt-2 rounded-md border border-primary/20 bg-secondary px-3 py-2 text-base font-bold text-primary">
                {visibleMessage}
              </p>
            ) : null}
          </div>

          <div className="grid min-h-[240px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <h2 className="text-xl font-black">Productos</h2>
                <p className="text-sm font-semibold text-muted-foreground">
                  Toca Agregar para sumarlo a la venta.
                </p>
              </div>
              <p className="hidden rounded-md bg-muted px-2 py-1 text-sm font-bold text-muted-foreground sm:block">
                {results.length} encontrados
              </p>
            </div>

            <div className="min-h-0 overflow-y-auto px-3 pb-3">
              {results.length > 0 ? (
                <div className="grid gap-2">
                  {results.map((product) => (
                    <ProductRow
                      key={product.sku}
                      product={product}
                      onAdd={() => addProduct(product)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-background p-4">
                  <p className="text-lg font-black">
                    Busca un producto para empezar.
                  </p>
                  <p className="mt-1 text-base font-semibold text-muted-foreground">
                    Ejemplos: martillo, tornillo, cemento, 779...
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="grid min-h-[500px] overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto]">
          <div className="border-b border-border bg-primary px-3 py-2 text-primary-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black leading-tight">
                  {isQuoteMode ? "Presupuesto actual" : "Venta actual"}
                </h2>
                <p className="text-sm font-semibold opacity-90">
                  {lines.length === 0
                    ? "Agrega productos desde la izquierda."
                    : `${lines.length} producto${
                        lines.length === 1 ? "" : "s"
                      } agregado${lines.length === 1 ? "" : "s"}.`}
                </p>
              </div>
              <p className="rounded-md bg-primary-foreground/15 px-2 py-1 text-sm font-black">
                Ticket
              </p>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto bg-background p-3">
            {lines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card p-4">
                <p className="text-lg font-black">No hay productos agregados.</p>
                <p className="mt-1 text-base font-semibold text-muted-foreground">
                  Busca un producto a la izquierda y toca Agregar.
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {lines.map((line) => (
                  <TicketLine
                    key={line.sku}
                    line={line}
                    onDecrement={() => decrementLineQuantity(line.sku)}
                    onIncrement={() => incrementLineQuantity(line.sku)}
                    onRemove={() => removeLine(line.sku)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t-2 border-primary bg-card p-3">
            {!isQuoteMode ? (
              <div className="mb-2 grid gap-2">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
                  <Field label="Forma de pago">
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                      className="h-11 rounded-md border border-input bg-background px-3 text-base font-semibold"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Monto pagado">
                    <input
                      value={paidAmount || String(total)}
                      onChange={(event) => setPaidAmount(event.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-11 rounded-md border border-input bg-background px-3 text-base font-semibold"
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            <div className="mb-2 flex items-end justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-wide text-muted-foreground">
                {isQuoteMode ? "Total presupuesto" : "Total"}
              </p>
              <p className="text-4xl font-black leading-none text-primary">
                {formatMoney(total)}
              </p>
            </div>

            {actionHelp ? (
              <p className="mb-2 rounded-md border border-yellow-500/40 bg-yellow-50 px-3 py-2 text-base font-bold text-yellow-950">
                {actionHelp}
              </p>
            ) : null}

            <div className="grid gap-2">
              {isQuoteMode ? (
                <Button
                  type="button"
                  onClick={saveQuote}
                  disabled={isPending || lines.length === 0}
                  className="h-14 text-xl font-black"
                >
                  Guardar presupuesto
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={registerSale}
                    disabled={
                      isPending ||
                      lines.length === 0 ||
                      hasOutOfStockLines ||
                      isCashRegisterClosed
                    }
                    className="h-14 text-xl font-black"
                  >
                    Cobrar venta
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={saveQuote}
                    disabled={isPending || lines.length === 0}
                    className="h-10 text-base font-bold"
                  >
                    Guardar presupuesto
                  </Button>
                </>
              )}

              <details className="rounded-md border border-border bg-background">
                <summary className="flex min-h-10 cursor-pointer items-center px-3 text-base font-black">
                  Cliente opcional
                </summary>
                <div className="grid gap-2 border-t border-border p-3">
                  <Field label="Cliente guardado">
                    <select
                      value={customer.id ?? ""}
                      onChange={(event) => selectCustomer(event.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-base"
                    >
                      <option value="">Sin cliente guardado</option>
                      {customers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nombre">
                    <input
                      value={customer.name}
                      onChange={(event) =>
                        updateCustomer("name", event.target.value)
                      }
                      disabled={Boolean(customer.id)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-base"
                    />
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Field label="Telefono">
                      <input
                        value={customer.phone}
                        onChange={(event) =>
                          updateCustomer("phone", event.target.value)
                        }
                        disabled={Boolean(customer.id)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-base"
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(event) =>
                          updateCustomer("email", event.target.value)
                        }
                        disabled={Boolean(customer.id)}
                        className="h-10 rounded-md border border-input bg-background px-3 text-base"
                      />
                    </Field>
                  </div>
                  <Field label="Domicilio">
                    <input
                      value={customer.address}
                      onChange={(event) =>
                        updateCustomer("address", event.target.value)
                      }
                      disabled={Boolean(customer.id)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-base"
                    />
                  </Field>
                </div>
              </details>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function getActionHelp({
  linesCount,
  isCashRegisterClosed,
  hasOutOfStockLines,
  isQuoteMode,
}: {
  linesCount: number;
  isCashRegisterClosed: boolean;
  hasOutOfStockLines: boolean;
  isQuoteMode: boolean;
}) {
  if (isQuoteMode) {
    return linesCount === 0 ? "Agrega productos para guardar." : "";
  }

  if (isCashRegisterClosed) {
    return CASH_REGISTER_CLOSED_MESSAGE;
  }

  if (hasOutOfStockLines) {
    return "Stock insuficiente. Revisa las cantidades antes de vender.";
  }

  if (linesCount === 0) {
    return "Agrega productos para cobrar.";
  }

  return "";
}

function CashBadge({ cashStatus }: { cashStatus: CashStatus }) {
  return (
    <div
      className={
        cashStatus.open
          ? "flex items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-emerald-900"
          : "flex items-center justify-between gap-3 rounded-md border border-yellow-500/40 bg-yellow-50 px-3 py-2 text-yellow-950"
      }
    >
      <div>
        <p className="text-base font-black">
          {cashStatus.open
            ? "Caja abierta - listo para cobrar"
            : "Caja cerrada - no se puede cobrar"}
        </p>
        {cashStatus.open ? (
          <p className="text-sm font-bold">
            Efectivo: {formatMoney(cashStatus.expectedCash)}
          </p>
        ) : null}
      </div>
      <Button asChild variant="outline" className="h-9 px-3 text-sm font-bold">
        <Link href="/caja">{cashStatus.open ? "Ver caja" : "Abrir caja"}</Link>
      </Button>
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className="h-9 px-4 text-base font-black"
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

function ProductRow({
  product,
  onAdd,
}: {
  product: QuoteProduct;
  onAdd: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_92px_116px_104px] md:items-center">
      <div className="min-w-0">
        <p className="line-clamp-2 text-lg font-black leading-tight">
          {product.name || product.description}
        </p>
        <p className="font-mono text-sm font-semibold text-muted-foreground">
          Codigo: {product.code}
        </p>
      </div>
      <InfoBlock
        label="Stock"
        value={`${formatStockQuantity(product.stockQuantity)} ${product.unit}`}
      />
      <div>
        <p className="text-sm font-bold text-muted-foreground">Precio</p>
        <p className="text-xl font-black text-primary">
          {formatMoney(product.price)}
        </p>
      </div>
      <Button type="button" onClick={onAdd} className="h-11 text-base font-black">
        Agregar
      </Button>
    </div>
  );
}

function TicketLine({
  line,
  onDecrement,
  onIncrement,
  onRemove,
}: {
  line: QuoteLine;
  onDecrement: () => void;
  onIncrement: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-base font-black leading-tight">
            {line.description}
          </p>
          <p className="font-mono text-sm font-semibold text-muted-foreground">
            Codigo: {line.code}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRemove}
          className="h-9 shrink-0 px-3 text-sm font-bold"
        >
          Quitar
        </Button>
      </div>

      <div className="grid grid-cols-[128px_minmax(0,1fr)] items-center gap-2">
        <div className="grid grid-cols-[38px_52px_38px] gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={onDecrement}
            className="h-10 px-0 text-xl font-black"
            aria-label={`Restar cantidad de ${line.description}`}
          >
            -
          </Button>
          <div className="grid h-10 place-items-center rounded-md border border-input bg-background text-base font-black">
            {line.quantity}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onIncrement}
            className="h-10 px-0 text-xl font-black"
            aria-label={`Sumar cantidad de ${line.description}`}
          >
            +
          </Button>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-muted-foreground">
            {formatMoney(line.price)} c/u
          </p>
          <p className="text-xl font-black text-primary">
            {formatMoney(line.quantity * line.price)}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <p className="text-base font-black">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold">
      <span>{label}</span>
      {children}
    </label>
  );
}
