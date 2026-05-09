"use client";

import { useActionState } from "react";
import { CheckCircle2, Save } from "lucide-react";

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
  brands,
}: {
  product: ProductListItem;
  categories: ProductCatalogOption[];
  brands: ProductCatalogOption[];
}) {
  const [state, formAction, pending] = useActionState(
    updateProductAction,
    initialState
  );

  return (
    <form action={formAction} className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4">
      <input type="hidden" name="sku" value={product.sku} />

      <Field label="Descripcion">
        <textarea
          name="description"
          defaultValue={product.description}
          required
          rows={3}
          className="min-h-24 rounded-lg border border-input bg-background px-3 py-3 text-base"
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Categoria">
          <input
            name="category"
            defaultValue={product.category}
            list="product-categories"
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Marca">
          <input
            name="brand"
            defaultValue={product.brand}
            list="product-brands"
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Unidad">
          <input
            name="unit"
            defaultValue={product.unit}
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Costo">
          <input
            name="cost"
            defaultValue={product.cost ?? ""}
            inputMode="decimal"
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Precio publico">
          <input
            name="salePrice"
            defaultValue={product.salePrice ?? ""}
            inputMode="decimal"
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Stock">
          <input
            name="stock"
            defaultValue={product.stock}
            inputMode="decimal"
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Stock minimo">
          <input
            name="minStock"
            defaultValue={product.minStock}
            inputMode="decimal"
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>

        <Field label="Estado">
          <select
            name="active"
            defaultValue={product.active ? "true" : "false"}
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          >
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </Field>
      </div>

      <datalist id="product-categories">
        {categories.map((category) => (
          <option key={category.name} value={category.name} />
        ))}
      </datalist>
      <datalist id="product-brands">
        {brands.map((brand) => (
          <option key={brand.name} value={brand.name} />
        ))}
      </datalist>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending} className="h-12 gap-2 px-5 text-base">
          <Save className="size-5" aria-hidden="true" />
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
        {state.message ? (
          <p className="inline-flex items-center gap-2 text-base font-semibold">
            {state.ok ? <CheckCircle2 className="size-5" aria-hidden="true" /> : null}
            {state.message}
          </p>
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
