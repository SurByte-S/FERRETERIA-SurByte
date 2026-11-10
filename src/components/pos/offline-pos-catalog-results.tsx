"use client";

import { formatStockQuantity } from "@/lib/format";
import type {
  OfflineCatalogLookupResult,
} from "@/lib/offline/catalog-store";

type OfflineSearchStatus = "idle" | "loading" | "results" | "empty" | "error";

type OfflinePosCatalogResultsProps = {
  message?: string | null;
  query: string;
  results: OfflineCatalogLookupResult[];
  status: OfflineSearchStatus;
};

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function displayValue(value: string | null | undefined) {
  const cleanValue = value?.trim();

  return cleanValue || "-";
}

function formatStock(value: number | null, unit: string | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${formatStockQuantity(value)} ${unit ?? ""}`.trim();
}

export function OfflinePosCatalogResults({
  message,
  query,
  results,
  status,
}: OfflinePosCatalogResultsProps) {
  return (
    <div className="grid gap-2">
      <div className="rounded-md border border-primary/30 bg-card p-3">
        <p className="text-lg font-black text-primary">Solo consulta offline</p>
        <p className="mt-1 text-base font-black text-foreground">
          No se puede vender sin internet.
        </p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Estos productos vienen del catalogo guardado en este equipo. Precio y
          stock pueden estar desactualizados.
        </p>
        {message ? (
          <p className="mt-2 text-sm font-bold text-foreground">{message}</p>
        ) : null}
      </div>

      {status === "loading" ? (
        <div className="rounded-md border border-border bg-background p-4">
          <p className="text-lg font-black">Buscando en catalogo guardado...</p>
          <p className="mt-1 text-base font-semibold text-muted-foreground">
            Espera un momento.
          </p>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-card p-4">
          <p className="text-lg font-black text-destructive">
            No se pudo leer el catalogo offline.
          </p>
          <p className="mt-1 text-base font-semibold text-muted-foreground">
            Con internet, anda a Stock y actualiza el catalogo para usar sin
            internet.
          </p>
        </div>
      ) : null}

      {status === "empty" ? (
        <div className="rounded-md border border-dashed border-border bg-background p-4">
          <p className="text-lg font-black">
            No se encontraron productos guardados con esa busqueda.
          </p>
          <p className="mt-1 text-base font-semibold text-muted-foreground">
            Con internet, anda a Stock y actualiza el catalogo para usar sin
            internet.
          </p>
        </div>
      ) : null}

      {status === "idle" ? (
        <div className="rounded-md border border-dashed border-border bg-background p-4">
          <p className="text-lg font-black">
            Escribi o escanea un codigo para consultar el catalogo guardado.
          </p>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="text-sm font-bold text-muted-foreground">
              {results.length === 1
                ? "1 producto de referencia"
                : `${results.length} productos de referencia`}
            </p>
            {query.trim() ? (
              <p className="text-sm font-semibold text-muted-foreground">
                Busqueda: {query.trim()}
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-secondary text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Codigo propio</th>
                  <th className="px-3 py-2">Codigo catalogo</th>
                  <th className="px-3 py-2">Codigo barras</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Stock estimado</th>
                  <th className="px-3 py-2">Marca</th>
                  <th className="px-3 py-2">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((result) => {
                  const product = result.product;
                  const saleUnit = result.saleUnit;
                  const displayBarcode = saleUnit?.barcode ?? product.barcode;
                  const displayPrice = saleUnit?.sale_price ?? product.sale_price;

                  return (
                  <tr key={`${product.id}:${saleUnit?.id ?? "product"}`}>
                    <td className="px-3 py-2 font-mono font-bold text-primary">
                      {displayValue(product.custom_code)}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {displayValue(product.sku)}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {displayValue(displayBarcode)}
                    </td>
                    <td className="max-w-[260px] px-3 py-2">
                      <p className="truncate font-bold text-foreground">
                        {product.name}
                      </p>
                      {saleUnit ? (
                        <p className="mt-0.5 truncate text-xs font-bold text-primary">
                          Coincidencia por presentacion: {saleUnit.name}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-primary">
                      {formatMoney(displayPrice)}
                      {saleUnit && saleUnit.sale_price !== null ? (
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          Precio base: {formatMoney(product.sale_price)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatStock(product.stock_quantity, product.unit)}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {displayValue(product.brand)}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {displayValue(product.category)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
