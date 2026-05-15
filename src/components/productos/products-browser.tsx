import Link from "next/link";
import {
  Box,
  ClipboardList,
  Edit3,
  History,
  ImageIcon,
  PackagePlus,
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
import { ProductEditForm } from "./product-edit-form";
import type { ProductCatalogOption, ProductListItem } from "./product-types";
import { StockAdjustForm } from "./stock-adjust-form";

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

export function ProductsBrowser({
  products,
  categories,
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
  categories: ProductCatalogOption[];
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
    code ? { label: "Codigo", value: code } : null,
    name ? { label: "Nombre", value: name } : null,
    categoryId
      ? { label: "Categoria", value: selectedCategory?.name ?? categoryId }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row">
        <Button
          asChild
          variant={mode === "mostrador" ? "default" : "outline"}
          className="h-14 flex-1 gap-2 text-lg"
        >
          <Link href={buildProductsHref({ code, name, categoryId, mode: "mostrador" })}>
            <PackageSearch className="size-6" aria-hidden="true" />
            Vista simple
          </Link>
        </Button>
        <Button
          asChild
          variant={mode === "administracion" ? "default" : "outline"}
          className="h-14 flex-1 gap-2 text-lg"
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
          <form className="grid gap-4 xl:grid-cols-[260px_1fr_300px_auto]" action="/productos">
            <input type="hidden" name="modo" value={mode} />
            <label className="grid gap-2 text-base font-semibold">
              <span>Buscar por código</span>
              <input
                name="codigo"
                defaultValue={code}
                placeholder="Ej: 12345 o código de barra"
                className="h-14 rounded-lg border border-input bg-background px-4 text-lg"
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
                  className="h-14 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-lg"
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
                className="h-14 rounded-lg border border-input bg-background px-3 text-base"
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
              <Button type="submit" className="h-14 w-full gap-2 px-6 text-lg xl:w-auto">
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
              <Button asChild variant="outline" className="h-12 gap-2 px-4 text-base">
                <Link href={buildProductsHref({ mode })}>
                  <X className="size-5" aria-hidden="true" />
                  Limpiar busqueda
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 gap-2 px-4 text-base">
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

            return (
            <Card key={product.id}>
              <CardHeader className="gap-4">
                <div
                  className={
                    mode === "administracion"
                      ? "grid gap-4 lg:grid-cols-[96px_1fr_auto] lg:items-start"
                      : "grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start"
                  }
                >
                  {mode === "administracion" ? <ProductThumb product={product} /> : null}
                  <div>
                    <p className="mb-2 font-mono text-base text-muted-foreground">
                      Código: {product.sku}
                    </p>
                    <CardTitle className="text-2xl">{product.name}</CardTitle>
                    {mode === "administracion" ? (
                      <CardDescription className="mt-2">
                        {product.category || "Sin categoría"} - {product.brand || "Sin marca"}
                      </CardDescription>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-border bg-background p-4 text-left lg:min-w-56">
                    <p className="text-base text-muted-foreground">Precio de venta</p>
                    <p className="mt-1 text-3xl font-bold">
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
                    <p className="mt-1 text-2xl font-bold">{product.stockQuantity}</p>
                  </div>
                  {mode === "administracion" ? (
                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="text-base text-muted-foreground">Stock minimo</p>
                      <p className="mt-1 text-2xl font-bold">{product.minStock}</p>
                    </div>
                  ) : null}
                  <div className={`rounded-lg border p-4 ${status.className}`}>
                    <p className="text-base">Estado</p>
                    <p className="mt-1 text-2xl font-bold">{status.label}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  {mode === "administracion" ? (
                    <>
                      <details className="group">
                        <summary className="list-none">
                          <Button asChild variant="outline" className="h-14 gap-2 px-6 text-lg">
                            <span>
                              <Edit3 className="size-6" aria-hidden="true" />
                              Editar
                            </span>
                          </Button>
                        </summary>
                        <ProductEditForm product={product} categories={categories} />
                      </details>

                      <details className="group">
                        <summary className="list-none">
                          <Button asChild variant="outline" className="h-14 gap-2 px-6 text-lg">
                            <span>
                              <PackagePlus className="size-6" aria-hidden="true" />
                              Ajustar stock
                            </span>
                          </Button>
                        </summary>
                        <StockAdjustForm product={product} />
                      </details>
                    </>
                  ) : null}

                  <Button asChild className="h-14 gap-2 px-6 text-lg">
                    <Link href={`/presupuestos/nuevo?sku=${encodeURIComponent(product.sku)}`}>
                      <ClipboardList className="size-6" aria-hidden="true" />
                      Usar en venta
                    </Link>
                  </Button>

                  {mode === "administracion" ? (
                    <Button asChild variant="outline" className="h-14 gap-2 px-6 text-lg">
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
          <Button asChild className="h-14 gap-2 px-8 text-lg">
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
        className="size-24 rounded-lg border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex size-24 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
      <ImageIcon className="size-9" aria-hidden="true" />
    </div>
  );
}
