"use client";

import { useActionState } from "react";
import { ImageUp, Save } from "lucide-react";

import {
  updateProductAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";
import type { ProductCatalogOption, ProductListItem } from "./product-types";

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

export function ProductEditForm({
  product,
  categories,
}: {
  product: ProductListItem;
  categories: ProductCatalogOption[];
}) {
  const [state, formAction, pending] = useActionState(
    updateProductAction,
    initialState
  );

  return (
    <form action={formAction} className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4">
      <input type="hidden" name="currentSku" value={product.sku} />
      <input type="hidden" name="currentImageUrl" value={product.imageUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre">
          <input name="name" defaultValue={product.name} required className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Código/SKU">
          <input name="sku" defaultValue={product.sku} required className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Código de barra">
          <input name="barcode" defaultValue={product.barcode} className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Precio de venta">
          <input name="salePrice" defaultValue={product.salePrice ?? ""} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Costo">
          <input name="cost" defaultValue={product.cost ?? ""} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Categoría">
          <select name="categoryId" defaultValue={product.categoryId} className="h-12 rounded-lg border border-input bg-background px-3 text-base">
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Marca">
          <input name="brand" defaultValue={product.brand} className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Unidad">
          <input name="unit" defaultValue={product.unit} className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Stock mínimo">
          <input name="minStock" defaultValue={product.minStock} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Activo/Inactivo">
          <select name="active" defaultValue={product.active ? "true" : "false"} className="h-12 rounded-lg border border-input bg-background px-3 text-base">
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </Field>
        <Field label="Foto del producto">
          <span className="flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-3 text-base">
            <ImageUp className="size-5" aria-hidden="true" />
            <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="w-full text-base" />
          </span>
        </Field>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending} className="h-14 gap-2 px-6 text-lg">
          <Save className="size-6" aria-hidden="true" />
          {pending ? "Guardando..." : "Guardar producto"}
        </Button>
        {state.message ? (
          <p className="text-base font-semibold">{state.message}</p>
        ) : null}
      </div>
    </form>
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
