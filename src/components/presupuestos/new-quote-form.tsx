"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Save, Search, Trash2, UserRound } from "lucide-react";

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
import type {
  QuoteCustomer,
  QuoteCustomerOption,
  QuoteLine,
  QuoteProduct,
} from "./quote-types";

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

export function NewQuoteForm({
  initialSku,
  customers,
}: {
  initialSku?: string;
  customers: QuoteCustomerOption[];
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
  const [quantity, setQuantity] = useState(1);
  const [results, setResults] = useState<QuoteProduct[]>([]);
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [message, setMessage] = useState("Buscá un producto por nombre o código.");
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.price, 0),
    [lines]
  );

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
        setMessage("Producto agregado al presupuesto.");
        return;
      }

      setResults(found);
      setMessage(
        found.length > 0
          ? "Elegí un producto de la lista para agregarlo."
          : "No encontramos productos con esa búsqueda."
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
      "Vas a quitar este producto del presupuesto. ¿Querés continuar?"
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

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserRound className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>Datos del cliente</CardTitle>
            <CardDescription>
              Son opcionales. Sirven para encontrar el presupuesto después.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
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
            <Field label="Nombre o razón social">
              <input
                value={customer.name}
                onChange={(event) => updateCustomer("name", event.target.value)}
                disabled={Boolean(customer.id)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={customer.phone}
                onChange={(event) => updateCustomer("phone", event.target.value)}
                disabled={Boolean(customer.id)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={customer.email}
                onChange={(event) => updateCustomer("email", event.target.value)}
                disabled={Boolean(customer.id)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Domicilio">
              <input
                value={customer.address}
                onChange={(event) => updateCustomer("address", event.target.value)}
                disabled={Boolean(customer.id)}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ClipboardList className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>Presupuesto rápido</CardTitle>
            <CardDescription>
              Buscá productos, agregá cantidades y revisá el total.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_160px_auto]">
              <label className="grid gap-2 text-base font-semibold">
                <span>Producto</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscá por nombre o código"
                    className="h-14 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-lg"
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
                  className="h-14 rounded-lg border border-input bg-background px-3 text-lg"
                />
              </label>

              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={runSearch}
                  disabled={isPending || !search.trim()}
                  className="h-14 w-full gap-2 px-6 text-lg"
                >
                  <Plus className="size-6" aria-hidden="true" />
                  Agregar producto
                </Button>
              </div>
            </div>

            <p className="rounded-lg border border-border bg-background p-4 text-base font-semibold">
              {isPending ? "Buscando productos..." : message}
            </p>

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
                      Código {product.code} - {formatMoney(product.price)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos agregados</CardTitle>
            <CardDescription>
              Cambiá la cantidad o quitá productos antes de guardar el presupuesto.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">Código</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3">Cantidad</th>
                  <th className="p-3">Precio</th>
                  <th className="p-3">Subtotal</th>
                  <th className="p-3">Quitar</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={6}>
                      Todavía no agregaste productos. Buscá uno por nombre o código.
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
                          className="h-11 w-24 rounded-lg border border-input bg-background px-3 text-base"
                        />
                      </td>
                      <td className="p-3">{formatMoney(line.price)}</td>
                      <td className="p-3 text-lg font-semibold">
                        {formatMoney(line.quantity * line.price)}
                      </td>
                      <td className="p-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => removeLine(line.sku)}
                          className="h-11 gap-2 px-4"
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

      <aside className="sticky bottom-4 top-6 h-fit">
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Total general</CardTitle>
            <CardDescription>El total se actualiza al cambiar cantidades.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-primary p-5 text-primary-foreground">
              <p className="text-lg">Total</p>
              <p className="mt-1 text-4xl font-bold">{formatMoney(total)}</p>
            </div>
            <Button
              type="button"
              onClick={saveQuote}
              disabled={isPending || lines.length === 0}
              className="mt-4 h-14 w-full gap-2 text-lg"
            >
              <Save className="size-6" aria-hidden="true" />
              {isPending ? "Guardando..." : "Guardar presupuesto"}
            </Button>
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
