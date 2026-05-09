"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  FileDown,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  getQuoteProductBySkuAction,
  saveQuoteAction,
  searchQuoteProductsAction,
} from "@/app/(dashboard)/presupuestos/nuevo/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { QuoteCustomer, QuoteLine, QuoteProduct } from "./quote-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export function NewQuoteForm({ initialSku }: { initialSku?: string }) {
  const [customer, setCustomer] = useState<QuoteCustomer>({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [search, setSearch] = useState(initialSku ?? "");
  const [quantity, setQuantity] = useState(1);
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [lines]
  );
  const total = subtotal;

  useEffect(() => {
    if (!initialSku) {
      return;
    }

    startTransition(async () => {
      const product = await getQuoteProductBySkuAction(initialSku);

      if (product) {
        addProduct(product, 1);
        setMessage("Producto agregado al presupuesto.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSku]);

  function updateCustomer(key: keyof QuoteCustomer, value: string) {
    setCustomer((current) => ({ ...current, [key]: value }));
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
    searchInputRef.current?.focus();
  }

  function runSearch() {
    setMessage("");
    startTransition(async () => {
      const found = await searchQuoteProductsAction(search);
      const exact = found.find(
        (product) =>
          product.sku.toLowerCase() === search.trim().toLowerCase() ||
          product.code.toLowerCase() === search.trim().toLowerCase()
      );

      if (exact) {
        addProduct(exact);
        setMessage("Producto agregado por coincidencia exacta.");
        return;
      }

      setResults(found);
      setMessage(
        found.length > 0
          ? "Selecciona un producto de la lista."
          : "No se encontraron productos."
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
          ? { ...line, quantity: Number.isFinite(nextQuantity) ? nextQuantity : 1 }
          : line
      )
    );
  }

  function removeLine(sku: string) {
    const confirmed = window.confirm(
      "Estas por quitar este producto del presupuesto. Queres continuar?"
    );

    if (!confirmed) {
      return;
    }

    setLines((current) => current.filter((line) => line.sku !== sku));
  }

  function printQuote() {
    window.print();
  }

  function saveQuote() {
    setMessage("");
    startTransition(async () => {
      const result = await saveQuoteAction({ customer, lines });
      setMessage(result.message);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="grid gap-6">
        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground print:hidden">
              <UserRound className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>Datos del cliente</CardTitle>
            <CardDescription>
              Completa los datos principales para el presupuesto.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Razon social o nombre">
              <input
                value={customer.name}
                onChange={(event) => updateCustomer("name", event.target.value)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Telefono">
              <input
                value={customer.phone}
                onChange={(event) => updateCustomer("phone", event.target.value)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={customer.email}
                onChange={(event) => updateCustomer("email", event.target.value)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Domicilio">
              <input
                value={customer.address}
                onChange={(event) => updateCustomer("address", event.target.value)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Agregar productos</CardTitle>
            <CardDescription>
              Presiona Enter para agregar si el codigo coincide exactamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_160px_auto]">
              <label className="grid gap-2 text-base font-semibold">
                <span>Codigo o descripcion</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Ejemplo: 3757 o codo"
                    className="h-14 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-lg"
                  />
                </div>
              </label>
              <Field label="Cantidad">
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  min="1"
                  step="1"
                  type="number"
                  className="h-14 rounded-lg border border-input bg-background px-3 text-lg"
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={runSearch}
                  disabled={isPending || !search.trim()}
                  className="h-14 w-full gap-2 px-6 text-lg"
                >
                  <Plus className="size-6" aria-hidden="true" />
                  Agregar
                </Button>
              </div>
            </div>

            {results.length > 0 ? (
              <div className="grid gap-2">
                {results.map((product) => (
                  <button
                    key={product.sku}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="rounded-lg border border-border bg-background p-4 text-left hover:bg-muted"
                  >
                    <span className="block text-lg font-semibold">
                      {product.description}
                    </span>
                    <span className="mt-1 block text-base text-muted-foreground">
                      Codigo {product.code} - {formatMoney(product.price)} - Stock {product.stock}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {message ? (
              <p className="rounded-lg border border-border bg-background p-4 text-base font-semibold">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle>Detalle del presupuesto</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">Codigo</th>
                  <th className="p-3">Descripcion</th>
                  <th className="p-3">Cantidad</th>
                  <th className="p-3">Precio</th>
                  <th className="p-3">Subtotal</th>
                  <th className="p-3 print:hidden">Quitar</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={6}>
                      Todavia no agregaste productos.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.sku} className="border-b border-border">
                      <td className="p-3 font-mono">{line.code}</td>
                      <td className="p-3">{line.description}</td>
                      <td className="p-3">
                        <input
                          value={line.quantity}
                          onChange={(event) =>
                            updateLineQuantity(line.sku, event.target.value)
                          }
                          type="number"
                          min="1"
                          step="1"
                          className="h-11 w-24 rounded-lg border border-input bg-background px-3 text-base print:border-0"
                        />
                      </td>
                      <td className="p-3">{formatMoney(line.price)}</td>
                      <td className="p-3 font-semibold">
                        {formatMoney(line.quantity * line.price)}
                      </td>
                      <td className="p-3 print:hidden">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeLine(line.sku)}
                          className="h-10 gap-2"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          Quitar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <aside className="sticky bottom-4 top-6 h-fit xl:block">
        <Card className="border-primary/40 print:border-0 print:shadow-none">
          <CardHeader>
            <CardTitle>Total</CardTitle>
            <CardDescription>Total siempre visible para controlar el presupuesto.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-base text-muted-foreground">Subtotal</p>
              <p className="mt-1 text-2xl font-bold">{formatMoney(subtotal)}</p>
            </div>
            <div className="rounded-lg bg-primary p-4 text-primary-foreground">
              <p className="text-base">Total</p>
              <p className="mt-1 text-4xl font-bold">{formatMoney(total)}</p>
            </div>
            <Button
              type="button"
              onClick={saveQuote}
              disabled={isPending}
              className="h-14 gap-2 text-lg print:hidden"
            >
              <Save className="size-6" aria-hidden="true" />
              Guardar presupuesto
            </Button>
            <div className="grid gap-2 print:hidden">
              <Button
                type="button"
                variant="outline"
                onClick={printQuote}
                className="h-12 gap-2 text-base"
              >
                <Printer className="size-5" aria-hidden="true" />
                Imprimir
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={printQuote}
                className="h-12 gap-2 text-base"
              >
                <FileDown className="size-5" aria-hidden="true" />
                Exportar PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </aside>
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
