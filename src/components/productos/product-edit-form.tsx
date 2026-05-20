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
  brands,
  product,
  suppliers,
}: {
  brands: ProductCatalogOption[];
  product: ProductListItem;
  suppliers: ProductCatalogOption[];
}) {
  const [state, formAction, pending] = useActionState(
    updateProductAction,
    initialState
  );

  return (
    <form action={formAction} className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="currentSku" value={product.sku} />
      <input type="hidden" name="currentImageUrl" value={product.imageUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre">
          <input name="name" defaultValue={product.name} required className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Codigo/SKU">
          <input name="sku" defaultValue={product.sku} required className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Codigo de barra">
          <input name="barcode" defaultValue={product.barcode} className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <label className="grid gap-2 text-base font-semibold md:col-span-2">
          <span>Descripcion</span>
          <textarea name="description" defaultValue={product.description} rows={3} className="rounded-lg border border-input bg-background px-3 py-2 text-base" />
        </label>
        <Field label="Unidad">
          <input name="unit" defaultValue={product.unit} className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Marca">
          <select name="brandId" defaultValue={product.brandId} className="h-12 rounded-lg border border-input bg-background px-3 text-base">
            <option value="">Sin marca</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proveedor">
          <select name="supplierId" defaultValue={product.supplierId} className="h-12 rounded-lg border border-input bg-background px-3 text-base">
            <option value="">Sin proveedor</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Costo sin IVA">
          <input name="costWithoutTax" defaultValue={product.costWithoutTax ?? ""} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="IVA %">
          <input name="taxRate" defaultValue={product.taxRate} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Costo con IVA">
          <input name="cost" defaultValue={product.costWithTax ?? ""} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Precio de venta">
          <input name="salePrice" defaultValue={product.salePrice ?? ""} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Stock minimo">
          <input name="minStock" defaultValue={product.minStock} inputMode="decimal" className="h-12 rounded-lg border border-input bg-background px-3 text-base" />
        </Field>
        <Field label="Stock actual">
          <input value={product.stockQuantity} readOnly className="h-12 rounded-lg border border-input bg-muted px-3 text-base" />
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
