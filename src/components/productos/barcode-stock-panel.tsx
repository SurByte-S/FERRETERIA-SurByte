"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Barcode, Search, X } from "lucide-react";

import {
  assignBarcodeToProductAction,
  lookupBarcodeStockAction,
  searchProductsForBarcodeAction,
  type BarcodeLookupResult,
  type BarcodeMutationResult,
  type BarcodeProductSearchResult,
} from "@/app/(dashboard)/stock/actions";
import { NewProductForm } from "@/app/(dashboard)/stock/new-product-form";
import { Button } from "@/components/ui/button";
import { formatStockQuantity } from "@/lib/format";
import {
  getBarcodeAssociationState,
  normalizeProductCode,
} from "@/lib/product-code";
import type { ProductListItem } from "./product-types";
import { StockAdjustDetails } from "./stock-adjust-details";

type CatalogOption = {
  id: string;
  name: string;
};

const emptyLookup: BarcodeLookupResult | null = null;
const emptyProductSearch: BarcodeProductSearchResult = {
  ok: false,
  message: "",
  products: [],
};

function normalizeInputCode(value: string) {
  return normalizeProductCode(value);
}

function getLookupCodeLabel(product: ProductListItem, code: string) {
  if (product.matchedBy === "product_barcode") {
    return `Codigo de barras: ${code}`;
  }

  if (product.matchedBy === "sale_unit_barcode") {
    return `Codigo de presentacion: ${code}`;
  }

  return `Codigo interno: ${code}`;
}

export function BarcodeStockPanel({
  brands,
  canCreate,
  canEditPrice,
  suppliers,
}: {
  brands: CatalogOption[];
  canCreate: boolean;
  canEditPrice: boolean;
  suppliers: CatalogOption[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [lookup, setLookup] = useState<BarcodeLookupResult | null>(emptyLookup);
  const [productSearch, setProductSearch] =
    useState<BarcodeProductSearchResult>(emptyProductSearch);
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(
    null
  );
  const [mutation, setMutation] = useState<BarcodeMutationResult | null>(null);
  const [pending, setPending] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      codeInputRef.current?.focus();
      codeInputRef.current?.select();
    }, 80);

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function resetFlow(nextCode = "") {
    setCode(nextCode);
    setLookup(null);
    setProductSearch(emptyProductSearch);
    setSelectedProduct(null);
    setMutation(null);
    setNameSearch("");
  }

  function runBarcodeLookup(rawCode = code) {
    const nextCode = normalizeInputCode(rawCode);

    if (!nextCode) {
      setLookup({
        ok: false,
        status: "error",
        code: "",
        message: "Escanea o escribi un codigo.",
      });
      return;
    }

    setPending(true);
    setCode(nextCode);
    setLookup(null);
    setProductSearch(emptyProductSearch);
    setSelectedProduct(null);
    setMutation(null);
    startTransition(async () => {
      const result = await lookupBarcodeStockAction(nextCode);
      setLookup(result);
      setSelectedProduct(result.status === "found" ? result.product : null);
      setPending(false);

      if (result.status === "not_found") {
        window.setTimeout(() => nameInputRef.current?.focus(), 80);
      }
    });
  }

  function runNameSearch() {
    const term = nameSearch.trim();

    if (term.length < 2) {
      setProductSearch({
        ok: false,
        message: "Escribi al menos 2 letras del producto.",
        products: [],
      });
      return;
    }

    setPending(true);
    setProductSearch({
      ok: true,
      message: "Buscando productos...",
      products: [],
    });
    startTransition(async () => {
      const result = await searchProductsForBarcodeAction(term);
      setProductSearch(result);
      setPending(false);
    });
  }

  function assignCode(product: ProductListItem) {
    setPending(true);
    setMutation(null);
    startTransition(async () => {
      const result = await assignBarcodeToProductAction({
        code,
        productId: product.id,
      });
      setMutation(result);
      setSelectedProduct(result.product ?? product);
      setPending(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          resetFlow();
          setOpen(true);
        }}
        variant="outline"
        className="h-12 gap-2 px-4 text-base xl:h-14 xl:px-6 xl:text-lg"
      >
        <Barcode className="size-5" aria-hidden="true" />
        Buscar o agregar producto
      </Button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-4">
              <div className="min-w-0 pr-2">
                <p className="truncate text-xl font-bold">
                  Buscar o agregar producto
                </p>
                <p className="text-sm font-semibold text-muted-foreground">
                  Escanea un codigo o escribilo para encontrar el producto.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500"
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
              <div className="grid gap-4">
                <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                  <form
                    action={() => runBarcodeLookup()}
                    className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <label className="grid gap-2 text-base font-bold">
                      <span>Codigo de barras o codigo interno</span>
                      <input
                        ref={codeInputRef}
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="Escribir o escanear codigo"
                        className="h-14 rounded-lg border border-input bg-background px-4 font-mono text-xl font-bold"
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={pending}
                      className="h-14 gap-2 self-end px-5 text-base"
                    >
                      <Search className="size-5" aria-hidden="true" />
                      {pending ? "Buscando..." : "Buscar producto"}
                    </Button>
                  </form>

                  {lookup && lookup.status !== "found" && lookup.message ? (
                    <StatusMessage ok={lookup.ok} message={lookup.message} />
                  ) : null}
                </section>

                {canCreate ? (
                  <div className="flex justify-start">
                    <NewProductForm
                      brands={brands}
                      canCreate={canCreate}
                      initialBarcode={code}
                      initialSku={code}
                      onCreated={() => runBarcodeLookup(code)}
                      suppliers={suppliers}
                      triggerLabel="Agregar producto nuevo"
                    />
                  </div>
                ) : null}

                {selectedProduct ? (
                  <ProductFound
                    key={selectedProduct.id}
                    brands={brands}
                    canEditPrice={canEditPrice}
                    code={code}
                    mutation={mutation}
                    onAdjusted={() => runBarcodeLookup(code)}
                    product={selectedProduct}
                    suppliers={suppliers}
                  />
                ) : null}

                {lookup?.status === "not_found" && !selectedProduct ? (
                  <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                    <div>
                      <h3 className="text-base font-bold">
                        Buscar producto existente por nombre
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">
                        Si ya existe, asocia este codigo. No crees otro producto.
                      </p>
                    </div>
                    <form
                      action={runNameSearch}
                      className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <label className="grid gap-2 text-base font-semibold">
                        <span>Buscar producto existente por nombre</span>
                        <input
                          ref={nameInputRef}
                          value={nameSearch}
                          onChange={(event) => setNameSearch(event.target.value)}
                          placeholder="Escribir nombre del producto"
                          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={pending}
                        className="h-12 gap-2 self-end px-4 text-base"
                      >
                        <Search className="size-5" aria-hidden="true" />
                        Buscar producto
                      </Button>
                    </form>

                    {productSearch.message ? (
                      <StatusMessage
                        ok={productSearch.ok}
                        message={productSearch.message}
                      />
                    ) : null}

                    {productSearch.products.length > 0 ? (
                      <div className="grid gap-2">
                        {productSearch.products.map((product) => {
                          const association =
                            getBarcodeAssociationState(product);

                          return (
                            <div
                              key={product.id}
                              className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                            >
                              <ProductSummary product={product} />
                              <div className="grid gap-2 md:justify-items-end">
                                {association.message ? (
                                  <p className="max-w-xs text-sm font-semibold text-muted-foreground md:text-right">
                                    {association.message}
                                  </p>
                                ) : null}
                                <Button
                                  type="button"
                                  disabled={pending || !association.canAssign}
                                  onClick={() => assignCode(product)}
                                  className="h-11 gap-2 px-4 text-base"
                                >
                                  <Barcode className="size-5" aria-hidden="true" />
                                  {association.canAssign
                                    ? "Asociar este codigo al producto"
                                    : association.buttonLabel}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {!canCreate && productSearch.ok && productSearch.products.length === 0 ? (
                      <StatusMessage
                        ok={false}
                        message="Tu usuario puede cargar stock, pero no crear productos."
                      />
                    ) : null}
                  </section>
                ) : null}

                <div className="flex justify-start">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetFlow();
                      window.setTimeout(() => codeInputRef.current?.focus(), 50);
                    }}
                    className="h-11 px-4 text-base"
                  >
                    Escanear otro codigo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ProductFound({
  brands,
  canEditPrice,
  code,
  mutation,
  onAdjusted,
  product,
  suppliers,
}: {
  brands: CatalogOption[];
  canEditPrice: boolean;
  code: string;
  mutation: BarcodeMutationResult | null;
  onAdjusted: () => void;
  product: ProductListItem;
  suppliers: CatalogOption[];
}) {
  return (
    <section className="grid gap-3 rounded-lg border border-emerald-500/40 bg-emerald-50/70 p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px] md:items-center">
        <div>
          <h3 className="text-base font-bold text-emerald-900">
            Producto encontrado
          </h3>
          <p className="mt-1 font-mono text-sm font-semibold text-emerald-800">
            {getLookupCodeLabel(product, code)}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-500/40 bg-background p-3">
          <p className="text-sm font-semibold text-muted-foreground">
            Stock actual
          </p>
          <p className="mt-1 text-xl font-bold">
            {formatStockQuantity(product.stockQuantity)} {product.unit}
          </p>
        </div>
      </div>

      {mutation?.message ? (
        <StatusMessage ok={mutation.ok} message={mutation.message} />
      ) : null}

      <ProductSummary product={product} />

      <StockAdjustDetails
        brands={brands}
        canEditPrice={canEditPrice}
        defaultOpen
        onAdjusted={onAdjusted}
        product={product}
        suppliers={suppliers}
      />
    </section>
  );
}

function ProductSummary({ product }: { product: ProductListItem }) {
  const association = getBarcodeAssociationState(product);

  return (
    <div className="min-w-0">
      <p className="font-mono text-sm font-semibold text-muted-foreground">
        Codigo interno: {product.sku}
      </p>
      <p className="mt-1 text-sm font-bold text-yellow-800">
        {association.statusLabel}
      </p>
      <p className="mt-1 line-clamp-2 text-lg font-bold">{product.name}</p>
      <p className="mt-1 text-sm font-semibold text-muted-foreground">
        Stock: {formatStockQuantity(product.stockQuantity)} {product.unit}
      </p>
    </div>
  );
}

function StatusMessage({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p
      className={
        ok
          ? "rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
          : "rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900"
      }
    >
      {message}
    </p>
  );
}
