import Link from "next/link";
import {
  Box,
  ClipboardList,
  Edit3,
  History,
  ImageIcon,
  PackageSearch,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatStockQuantity } from "@/lib/format";
import { isInheritedProductBarcode } from "@/lib/product-code";
import { ProductEditForm } from "./product-edit-form";
import type { ProductCatalogOption, ProductListItem } from "./product-types";
import { StockAdjustDetails } from "./stock-adjust-details";

function formatMoney(value: number | null) {
  if (value === null) {
    return "Sin precio";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function buildMoreHref({
  code,
  name,
  categoryId,
  mode,
  page,
}: {
  code: string;
  name: string;
  categoryId: string;
  mode: ProductBrowserMode;
  page: number;
}) {
  const params = new URLSearchParams();

  if (code) params.set("codigo", code);
  if (name) params.set("nombre", name);
  if (categoryId) params.set("categoria", categoryId);
  params.set("modo", mode);
  params.set("page", String(page + 1));

  return `/productos?${params.toString()}`;
}

type ProductBrowserMode = "mostrador" | "administracion";

function buildProductsHref({
  code,
  name,
  categoryId,
  mode,
}: {
  code?: string;
  name?: string;
  categoryId?: string;
  mode: ProductBrowserMode;
}) {
  const params = new URLSearchParams();

  if (code) params.set("codigo", code);
  if (name) params.set("nombre", name);
  if (categoryId) params.set("categoria", categoryId);
  params.set("modo", mode);

  return `/productos?${params.toString()}`;
}

function stockStatus(product: ProductListItem) {
  if (product.stockQuantity <= 0) {
    return {
      label: "Sin stock",
      className: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }

  if (product.stockQuantity <= product.minStock) {
    return {
      label: "Bajo stock",
      className: "border-yellow-500/40 bg-yellow-50 text-yellow-800",
    };
  }

  return {
    label: "Stock OK",
    className: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  };
}

function productBarcodeLabel(product: ProductListItem) {
  if (!product.productBarcode) {
    return "";
  }

  if (
    isInheritedProductBarcode({
      barcode: product.productBarcode,
      sku: product.sku,
    })
  ) {
    return "Codigo interno heredado";
  }

  return `Codigo de barras: ${product.productBarcode}`;
}

export function ProductsBrowser({
  products,
  brands,
  categories,
  suppliers,
  code,
  name,
  categoryId,
  page,
  total,
  showing,
  lowStockCount,
  mode,
}: {
  products: ProductListItem[];
  brands: ProductCatalogOption[];
  categories: ProductCatalogOption[];
  suppliers: ProductCatalogOption[];
  code: string;
  name: string;
  categoryId: string;
  page: number;
  total: number;
  showing: number;
  lowStockCount: number;
  mode: ProductBrowserMode;
}) {
  const canShowMore = showing < total;
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const activeFilters = [
    code ? { label: "Codigo interno o barras", value: code } : null,
    name ? { label: "Nombre", value: name } : null,
    categoryId
      ? { label: "Categoria", value: selectedCategory?.name ?? categoryId }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="grid gap-4 xl:gap-6">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row">
        <Button
          asChild
          variant={mode === "mostrador" ? "default" : "outline"}
          className="h-11 flex-1 gap-2 text-base xl:h-14 xl:text-lg"
        >
          <Link href={buildProductsHref({ code, name, categoryId, mode: "mostrador" })}>
            <PackageSearch className="size-6" aria-hidden="true" />
            Vista simple
          </Link>
        </Button>
        <Button
          asChild
          variant={mode === "administracion" ? "default" : "outline"}
          className="h-11 flex-1 gap-2 text-base xl:h-14 xl:text-lg"
        >
          <Link
            href={buildProductsHref({
              code,
              name,
              categoryId,
              mode: "administracion",
            })}
          >
            <SlidersHorizontal className="size-6" aria-hidden="true" />
            Editar productos
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar productos</CardTitle>
          <CardDescription>
            Usá un campo a la vez o combinalos para encontrar más rápido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 2xl:grid-cols-[240px_minmax(0,1fr)_260px_auto]" action="/productos">
            <input type="hidden" name="modo" value={mode} />
            <label className="grid gap-2 text-base font-semibold">
              <span>Buscar por código</span>
              <input
                name="codigo"
                defaultValue={code}
                placeholder="Ej: 12345 o código de barra"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base xl:h-14 xl:px-4 xl:text-lg"
              />
            </label>

            <label className="grid gap-2 text-base font-semibold">
              <span>Buscar por nombre</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="nombre"
                  defaultValue={name}
                  placeholder="Ej: tornillo, pintura, llave"
                  className="h-11 w-full rounded-lg border border-input bg-background pl-11 pr-3 text-base xl:h-14 xl:pl-12 xl:pr-4 xl:text-lg"
                />
              </div>
              <span className="text-sm font-normal text-muted-foreground">
                Escribí al menos 2 letras para buscar por nombre.
              </span>
            </label>

            <label className="grid gap-2 text-base font-semibold">
              <span>Elegir categoría</span>
              <select
                name="categoria"
                defaultValue={categoryId}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base xl:h-14"
              >
                <option value="">Todas las categorías</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button type="submit" className="h-11 w-full gap-2 px-5 text-base 2xl:w-auto xl:h-14 xl:px-6 xl:text-lg">
                <PackageSearch className="size-6" aria-hidden="true" />
                Buscar
              </Button>
            </div>
          </form>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {activeFilters.length > 0 ? (
                activeFilters.map((filter) => (
                  <span
                    key={`${filter.label}-${filter.value}`}
                    className="rounded-full border border-border bg-background px-3 py-2 text-sm font-semibold"
                  >
                    {filter.label}: {filter.value}
                  </span>
                ))
              ) : (
                <span className="text-base font-semibold text-muted-foreground">
                  Sin filtros activos.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline" className="h-10 gap-2 px-3 text-sm xl:h-12 xl:px-4 xl:text-base">
                <Link href={buildProductsHref({ mode })}>
                  <X className="size-5" aria-hidden="true" />
                  Limpiar busqueda
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-10 gap-2 px-3 text-sm xl:h-12 xl:px-4 xl:text-base">
                <Link href={buildProductsHref({ mode })}>
                  <PackageSearch className="size-5" aria-hidden="true" />
                  Ver todos
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-semibold">
          Mostrando {showing} de {total} productos
        </p>
        {name.length === 1 ? (
          <p className="text-base font-semibold text-muted-foreground">
            Escribí al menos 2 letras para buscar por nombre.
          </p>
        ) : null}
      </div>

      {lowStockCount > 0 ? (
        <Card className="border-yellow-500/40">
          <CardContent className="p-4">
            <p className="text-lg font-semibold">
              Hay {lowStockCount} productos con bajo stock.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {products.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Box className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>No hay productos para mostrar</CardTitle>
            <CardDescription>
              Buscá un producto por código, escribí al menos 2 letras del nombre o elegí una categoría.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {products.map((product) => {
            const status = stockStatus(product);
            const barcodeLabel = productBarcodeLabel(product);

            return (
            <Card key={product.id}>
              <CardHeader className="gap-4">
                <div
                  className={
                    mode === "administracion"
                      ? "grid gap-3 xl:grid-cols-[80px_minmax(0,1fr)_auto] xl:items-start 2xl:grid-cols-[96px_minmax(0,1fr)_auto]"
                      : "grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start"
                  }
                >
                  {mode === "administracion" ? <ProductThumb product={product} /> : null}
                  <div className="min-w-0">
                    <p className="mb-2 font-mono text-base text-muted-foreground">
                      Codigo interno: {product.sku}
                    </p>
                    {barcodeLabel ? (
                      <p className="mb-2 font-mono text-sm font-semibold text-muted-foreground">
                        {barcodeLabel}
                      </p>
                    ) : null}
                    <CardTitle className="text-xl xl:text-2xl">{product.name}</CardTitle>
                    {mode === "administracion" ? (
                      <CardDescription className="mt-2">
                        {product.category || "Sin categoría"} - {product.brand || "Sin marca"}
                      </CardDescription>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-left xl:min-w-48 xl:p-4">
                    <p className="text-base text-muted-foreground">Precio de venta</p>
                    <p className="mt-1 text-2xl font-bold xl:text-3xl">
                      {formatMoney(product.salePrice)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div
                  className={
                    mode === "administracion"
                      ? "grid gap-3 md:grid-cols-3"
                      : "grid gap-3 md:grid-cols-2"
                  }
                >
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-base text-muted-foreground">Stock actual</p>
                    <p className="mt-1 text-2xl font-bold">
                      {formatStockQuantity(product.stockQuantity)}
                    </p>
                  </div>
                  {mode === "administracion" ? (
                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="text-base text-muted-foreground">Stock minimo</p>
                      <p className="mt-1 text-2xl font-bold">
                        {formatStockQuantity(product.minStock)}
                      </p>
                    </div>
                  ) : null}
                  <div className={`rounded-lg border p-4 ${status.className}`}>
                    <p className="text-base">Estado</p>
                    <p className="mt-1 text-2xl font-bold">{status.label}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {mode === "administracion" ? (
                    <>
                      <details className="group">
                        <summary className="list-none">
                          <Button asChild variant="outline" className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-6 xl:text-lg">
                            <span>
                              <Edit3 className="size-6" aria-hidden="true" />
                              Editar
                            </span>
                          </Button>
                        </summary>
                        <ProductEditForm
                          product={product}
                          brands={brands}
                          suppliers={suppliers}
                        />
                      </details>

                      <StockAdjustDetails
                        product={product}
                        brands={brands}
                        canEditPrice={mode === "administracion"}
                        suppliers={suppliers}
                      />
                    </>
                  ) : null}

                  <Button asChild className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-6 xl:text-lg">
                    <Link href={`/inicio?sku=${encodeURIComponent(product.sku)}`}>
                      <ClipboardList className="size-6" aria-hidden="true" />
                      Usar en venta
                    </Link>
                  </Button>

                  {mode === "administracion" ? (
                    <Button asChild variant="outline" className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-6 xl:text-lg">
                      <Link href={`/productos/${product.id}/stock`}>
                        <History className="size-6" aria-hidden="true" />
                        Ver historial
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {canShowMore ? (
        <div className="flex justify-center">
          <Button asChild className="h-11 gap-2 px-6 text-base xl:h-14 xl:px-8 xl:text-lg">
            <Link href={buildMoreHref({ code, name, categoryId, mode, page })}>
              <PackageSearch className="size-6" aria-hidden="true" />
              Ver más productos
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ProductThumb({ product }: { product: ProductListItem }) {
  if (product.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.imageUrl}
        alt={`Foto de ${product.name}`}
        className="size-20 rounded-lg border border-border object-cover 2xl:size-24"
      />
    );
  }

  return (
    <div className="flex size-20 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground 2xl:size-24">
      <ImageIcon className="size-9" aria-hidden="true" />
    </div>
  );
}
