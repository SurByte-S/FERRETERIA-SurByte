"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";

import {
  getQuoteProductBySkuAction,
  saveQuoteAction,
  saveQuoteAndConvertToSaleAction,
  searchQuoteProductsAction,
} from "@/app/(dashboard)/presupuestos/nuevo/actions";
import { Button } from "@/components/ui/button";
import type {
  QuoteCustomer,
  QuoteCustomerOption,
  QuoteLine,
  QuoteProduct,
} from "@/components/presupuestos/quote-types";

const EMPTY_SEARCH_MESSAGE =
  "Buscá por código, barra, nombre o detalle.";

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
  return normalizeFormattedText(new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value));
}

function formatStock(value: number) {
  return normalizeFormattedText(new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value));
}

function formatDate(value: string) {
  return normalizeFormattedText(new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value)));
}

export function QuickSale({
  initialSku,
  customers,
  cashStatus,
}: {
  initialSku?: string;
  customers: QuoteCustomerOption[];
  cashStatus?: CashStatus;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState<QuoteCustomer>({
    id: "",
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [search, setSearch] = useState(initialSku ?? "");
  const [mode, setMode] = useState<SaleMode>("sale");
  const [quantity, setQuantity] = useState(1);
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [message, setMessage] = useState(EMPTY_SEARCH_MESSAGE);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [paidAmount, setPaidAmount] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [lines]
  );
  const hasOutOfStockLines = useMemo(
    () => lines.some((line) => !line.availableForSale),
    [lines]
  );
  const isQuoteMode = mode === "quote";
  const modeHelp = isQuoteMode
    ? "Buscá productos del catálogo, aunque no tengan stock."
    : "Buscá productos con stock para vender.";
  const resultHelp = isQuoteMode
    ? "Productos del catálogo. Los faltantes salen como A pedido."
    : "Solo productos con stock disponible.";

  useEffect(() => {
    if (!initialSku) {
      return;
    }

    startTransition(async () => {
      const product = await getQuoteProductBySkuAction(initialSku, isQuoteMode);

      if (product) {
        addProduct(product, 1);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            ? "Elegí un producto de la lista para agregarlo."
            : isQuoteMode
              ? "No encontramos productos para esa búsqueda."
              : "No encontramos productos con stock para esa búsqueda."
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
        ? "Modo presupuesto: podés buscar productos aunque no tengan stock."
        : EMPTY_SEARCH_MESSAGE
    );
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
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

  function handleSearchChange(value: string) {
    setSearch(value);

    if (!value.trim()) {
      setResults([]);
      setMessage(EMPTY_SEARCH_MESSAGE);
    }
  }

  function addProduct(product: QuoteProduct, qty = quantity) {
    const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;

    setLines((current) => {
      const existing = current.find((line) => line.sku === product.sku);

      if (existing) {
        return current.map((line) =>
          line.sku === product.sku
            ? { ...line, quantity: line.quantity + safeQty }
            : line
        );
      }

      return [...current, { ...product, quantity: safeQty }];
    });
    setSearch("");
    setResults([]);
    setQuantity(1);
    setMessage("Producto agregado a la lista.");
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
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
          ? "Elegí un producto de la lista para agregarlo."
          : isQuoteMode
            ? "No encontramos productos para esa búsqueda."
            : "No encontramos productos con stock para esa búsqueda."
      );
    });
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  }

  function updateLineQuantity(sku: string, value: string) {
    const nextQuantity = Number(value);
    setLines((current) =>
      current.map((line) =>
        line.sku === sku
          ? {
              ...line,
              quantity:
                Number.isFinite(nextQuantity) && nextQuantity > 0
                  ? nextQuantity
                  : 1,
            }
          : line
      )
    );
  }

  function removeLine(sku: string) {
    const confirmed = window.confirm(
      "Vas a quitar este producto. ¿Querés continuar?"
    );

    if (!confirmed) {
      return;
    }

    setLines((current) => current.filter((line) => line.sku !== sku));
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
    if (hasOutOfStockLines) {
      setMessage(
        "Hay productos a pedido. Guarda presupuesto o quitalos antes de vender."
      );
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
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
      <section className="grid gap-4 rounded-lg border border-primary/20 bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Search className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold leading-tight text-primary">
                Vender
              </h1>
              <p className="text-base text-muted-foreground">
                {modeHelp}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:max-w-md">
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

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px]">
            <label className="grid gap-2 text-base font-semibold">
              <span>Producto</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={EMPTY_SEARCH_MESSAGE}
                  className="h-16 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-xl"
                />
              </div>
            </label>

            <label className="grid gap-2 text-base font-semibold">
              <span>Cantidad</span>
              <input
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                min="1"
                step="1"
                type="number"
                className="h-16 rounded-lg border border-input bg-background px-3 text-xl"
              />
            </label>
          </div>
        </div>

        <Button
          type="button"
          onClick={runSearch}
          disabled={isPending || !search.trim()}
          className="h-16 w-full gap-2 px-6 text-lg lg:w-auto"
        >
          <Search className="size-6" aria-hidden="true" />
          Buscar
        </Button>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section
          aria-label="Productos encontrados"
          className="flex min-h-[260px] flex-col overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-lg font-bold">Productos</h2>
              <p className="text-sm font-medium text-muted-foreground">
                {resultHelp}
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold text-primary">
              {results.length} encontrados
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {results.length > 0 ? (
              <div className="grid gap-3">
                {results.map((product) => (
                  <ProductResult
                    key={product.sku}
                    product={product}
                    onAdd={() => addProduct(product)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid h-full min-h-48 place-items-center rounded-lg border border-dashed border-border bg-background p-6 text-center text-base font-semibold text-muted-foreground">
                {isPending ? "Buscando productos..." : message}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-primary/30 bg-card lg:sticky lg:top-0 lg:max-h-[calc(100vh-7.5rem)] lg:min-h-0 lg:self-start">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-lg font-bold">
                {isQuoteMode ? "Lista de presupuesto" : "Lista de venta"}
              </h2>
              <p className="text-sm font-medium text-muted-foreground">
                {isQuoteMode
                  ? "Guarda el presupuesto al finalizar."
                  : "Elegí Venta o Guardar presupuesto al finalizar."}
              </p>
            </div>
            <ClipboardList className="size-6 text-primary" aria-hidden="true" />
          </div>

          <div className="min-h-[140px] flex-1 overflow-y-auto p-3">
            {lines.length === 0 ? (
              <div className="grid h-full min-h-48 place-items-center rounded-lg border border-dashed border-border bg-background p-5 text-center text-base font-semibold text-muted-foreground">
                Todavía no agregaste productos.
              </div>
            ) : (
              <div className="grid gap-3">
                {lines.map((line) => (
                  <div
                    key={line.sku}
                    className="grid gap-3 rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold">
                          {line.description}
                        </p>
                        <p className="font-mono text-sm text-muted-foreground">
                          {line.code}
                        </p>
                        {!line.availableForSale ? (
                          <span className="mt-2 inline-flex rounded-full border border-yellow-500/40 bg-yellow-50 px-3 py-1 text-sm font-bold text-yellow-900">
                            A pedido
                          </span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeLine(line.sku)}
                        className="h-10 px-3"
                        aria-label={`Quitar ${line.description}`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-[96px_1fr] items-end gap-3">
                      <label className="grid gap-1 text-sm font-semibold">
                        <span>Cant.</span>
                        <input
                          value={line.quantity}
                          onChange={(event) =>
                            updateLineQuantity(line.sku, event.target.value)
                          }
                          type="number"
                          min="1"
                          step="1"
                          className="h-11 rounded-lg border border-input bg-card px-3 text-base"
                        />
                      </label>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          {formatMoney(line.price)} c/u
                        </p>
                        <p className="text-xl font-bold text-primary">
                          {formatMoney(line.quantity * line.price)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid shrink-0 gap-3 border-t border-border bg-background p-4">
            {cashStatus && !isQuoteMode ? (
              <CashStatusLine cashStatus={cashStatus} />
            ) : null}

            <details className="rounded-lg border border-border bg-card">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-3 text-base font-semibold">
                <UserRound className="size-5 text-primary" aria-hidden="true" />
                Cliente opcional
              </summary>
              <div className="grid gap-3 border-t border-border p-3">
                <p className="text-sm text-muted-foreground">
                  El cliente es opcional. Agregalo solo si necesitas cuenta
                  corriente, garantía o seguimiento.
                </p>
                <Field label="Cliente guardado">
                  <select
                    value={customer.id ?? ""}
                    onChange={(event) => selectCustomer(event.target.value)}
                    className="h-12 rounded-lg border border-input bg-background px-3 text-base"
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
                    className="h-12 rounded-lg border border-input bg-background px-3 text-base"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Teléfono">
                    <input
                      value={customer.phone}
                      onChange={(event) =>
                        updateCustomer("phone", event.target.value)
                      }
                      disabled={Boolean(customer.id)}
                      className="h-12 rounded-lg border border-input bg-background px-3 text-base"
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
                      className="h-12 rounded-lg border border-input bg-background px-3 text-base"
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
                    className="h-12 rounded-lg border border-input bg-background px-3 text-base"
                  />
                </Field>
              </div>
            </details>

            <div className="rounded-lg bg-primary p-4 text-primary-foreground">
              <div className="flex items-end justify-between gap-3">
                <p className="text-lg font-semibold">Total</p>
                <p className="text-4xl font-bold">{formatMoney(total)}</p>
              </div>
            </div>

            {!isQuoteMode ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Pago">
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    className="h-12 rounded-lg border border-input bg-card px-3 text-base"
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
                    className="h-12 rounded-lg border border-input bg-card px-3 text-base"
                  />
                </Field>
              </div>
            ) : null}

            {hasOutOfStockLines ? (
              <p className="rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-base font-semibold text-yellow-900">
                Hay productos a pedido. Esta lista debe guardarse como
                presupuesto.
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {isQuoteMode ? (
                <Button
                  type="button"
                  onClick={saveQuote}
                  disabled={isPending || lines.length === 0}
                  className="h-14 gap-2 text-lg sm:col-span-2"
                >
                  <Save className="size-6" aria-hidden="true" />
                  Guardar presupuesto
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={registerSale}
                    disabled={
                      isPending || lines.length === 0 || hasOutOfStockLines
                    }
                    className="h-14 gap-2 text-lg"
                  >
                    <ShoppingCart className="size-6" aria-hidden="true" />
                    {isPending ? "Procesando..." : "Venta"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={saveQuote}
                    disabled={isPending || lines.length === 0}
                    className="h-14 gap-2 text-lg"
                  >
                    <Save className="size-6" aria-hidden="true" />
                    Guardar presupuesto
                  </Button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CashStatusLine({ cashStatus }: { cashStatus: CashStatus }) {
  return (
    <div
      className={
        cashStatus.open
          ? "flex items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm"
          : "flex items-center justify-between gap-3 rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm"
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        <WalletCards
          className={
            cashStatus.open
              ? "size-5 shrink-0 text-emerald-800"
              : "size-5 shrink-0 text-yellow-900"
          }
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-bold">
            {cashStatus.open ? "Caja abierta" : "Caja cerrada"}
          </p>
          <p className="truncate text-muted-foreground">
            {cashStatus.open
              ? `${formatDate(cashStatus.openedAt)} - ${formatMoney(
                  cashStatus.expectedCash
                )}`
              : "Abrí caja antes de cobrar en efectivo."}
          </p>
        </div>
      </div>
      <Button asChild variant="outline" className="h-10 px-3 text-sm">
        <Link href="/caja">Caja</Link>
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
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className="h-14 text-lg"
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

function ProductResult({
  product,
  onAdd,
}: {
  product: QuoteProduct;
  onAdd: () => void;
}) {
  const inStock = product.availableForSale;

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-[130px_minmax(0,1fr)_140px_120px_110px_auto] md:items-center">
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Código</p>
        <p className="font-mono text-base font-bold">{product.code}</p>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-muted-foreground">Producto</p>
        <p className="truncate text-lg font-bold">
          {product.name || product.description}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Precio</p>
        <p className="text-lg font-bold">{formatMoney(product.price)}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Stock</p>
        <p className="text-lg font-bold">
          {formatStock(product.stockQuantity)} {product.unit}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground">Estado</p>
        <span
          className={
            inStock
              ? "inline-flex rounded-full border border-emerald-500/40 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800"
              : "inline-flex rounded-full border border-yellow-500/40 bg-yellow-50 px-3 py-1 text-sm font-bold text-yellow-900"
          }
        >
          {inStock ? "Con stock" : "A pedido"}
        </span>
      </div>
      <Button type="button" onClick={onAdd} className="h-12 gap-2 px-5 text-base">
        <Plus className="size-5" aria-hidden="true" />
        Agregar
      </Button>
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
    <label className="grid gap-2 text-base font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}
