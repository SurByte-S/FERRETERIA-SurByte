import Link from "next/link";
import { ClipboardList, Edit3, PackageSearch, Search } from "lucide-react";

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

function formatMoney(value: number | null) {
  if (value === null) {
    return "Revisar";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function stockState(product: ProductListItem) {
  if (!product.active) {
    return {
      label: "Inactivo",
      className: "border-zinc-300 bg-zinc-100 text-zinc-800",
    };
  }

  if (product.stock <= 0) {
    return {
      label: "Sin stock",
      className: "border-red-300 bg-red-50 text-red-900",
    };
  }

  if (product.stock <= product.minStock) {
    return {
      label: "Bajo",
      className: "border-yellow-300 bg-yellow-50 text-yellow-950",
    };
  }

  return {
    label: "Disponible",
    className: "border-green-300 bg-green-50 text-green-900",
  };
}

export function ProductsBrowser({
  products,
  categories,
  brands,
  query,
  category,
  brand,
}: {
  products: ProductListItem[];
  categories: ProductCatalogOption[];
  brands: ProductCatalogOption[];
  query: string;
  category: string;
  brand: string;
}) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Buscar productos</CardTitle>
          <CardDescription>
            Busca por codigo, SKU o descripcion. Usa filtros para encontrar mas rapido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-[1fr_260px_260px_auto]" action="/productos">
            <label className="grid gap-2 text-base font-semibold">
              <span>Codigo o descripcion</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Ejemplo: codo, 3757, pintura"
                  className="h-14 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-lg"
                />
              </div>
            </label>

            <label className="grid gap-2 text-base font-semibold">
              <span>Categoria</span>
              <select
                name="categoria"
                defaultValue={category}
                className="h-14 rounded-lg border border-input bg-background px-3 text-base"
              >
                <option value="">Todas</option>
                {categories.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-base font-semibold">
              <span>Marca</span>
              <select
                name="marca"
                defaultValue={brand}
                className="h-14 rounded-lg border border-input bg-background px-3 text-base"
              >
                <option value="">Todas</option>
                {brands.map((item) => (
                  <option key={item.name} value={item.name}>
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
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-semibold">
          {products.length} productos encontrados
        </p>
        <Button asChild variant="outline" className="h-12 gap-2 px-5 text-base">
          <Link href="/productos/importar">
            <PackageSearch className="size-5" aria-hidden="true" />
            Importar productos
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay productos para mostrar</CardTitle>
            <CardDescription>
              Cambia la busqueda o importa el CSV de productos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-12 gap-2 px-5 text-base">
              <Link href="/productos/importar">
                <PackageSearch className="size-5" aria-hidden="true" />
                Importar productos
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {products.map((product) => {
            const stock = stockState(product);

            return (
              <Card key={product.sku}>
                <CardHeader className="gap-4">
                  <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                    <div>
                      <p className="mb-2 font-mono text-sm text-muted-foreground">
                        Codigo: {product.code || product.sku}
                      </p>
                      <CardTitle className="text-2xl">
                        {product.description}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {product.category || "Sin categoria"} · {product.brand || "Sin marca"} · {product.unit}
                      </CardDescription>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4 text-left xl:min-w-56">
                      <p className="text-base text-muted-foreground">Precio publico</p>
                      <p className="mt-1 text-3xl font-bold">
                        {formatMoney(product.salePrice)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="text-base text-muted-foreground">Stock</p>
                      <p className="mt-1 text-2xl font-bold">{product.stock}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="text-base text-muted-foreground">Stock minimo</p>
                      <p className="mt-1 text-2xl font-bold">{product.minStock}</p>
                    </div>
                    <div className={`rounded-lg border p-4 ${stock.className}`}>
                      <p className="text-base">Semaforo</p>
                      <p className="mt-1 text-2xl font-bold">{stock.label}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <details className="group">
                      <summary className="list-none">
                        <Button asChild variant="outline" className="h-12 gap-2 px-5 text-base">
                          <span>
                            <Edit3 className="size-5" aria-hidden="true" />
                            Editar
                          </span>
                        </Button>
                      </summary>
                      <ProductEditForm
                        product={product}
                        categories={categories}
                        brands={brands}
                      />
                    </details>

                    <Button asChild className="h-12 gap-2 px-5 text-base">
                      <Link href={`/presupuestos/nuevo?sku=${encodeURIComponent(product.sku)}`}>
                        <ClipboardList className="size-5" aria-hidden="true" />
                        Crear presupuesto con este producto
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
