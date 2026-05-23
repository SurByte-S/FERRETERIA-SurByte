"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import {
  updateProductPriceAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

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

export function ProductPriceForm({
  productId,
  sku,
  name,
  salePrice,
}: {
  productId: string;
  sku: string;
  name: string;
  salePrice: number | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateProductPriceAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4"
    >
      <input type="hidden" name="productId" value={productId} />

      <div className="grid gap-2">
        <p className="font-mono text-base font-semibold text-foreground">
          Codigo/SKU: {sku}
        </p>
        <h3 className="text-xl font-bold">{name}</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-base font-semibold text-muted-foreground">
            Precio actual
          </p>
          <p className="mt-1 text-2xl font-bold">{formatMoney(salePrice)}</p>
        </div>

        <label className="grid gap-2 text-base font-semibold">
          <span>Nuevo precio</span>
          <input
            name="salePrice"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={salePrice ?? ""}
            required
            className="h-14 rounded-lg border border-input bg-background px-3 text-lg"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pending}
          className="h-14 gap-2 px-6 text-lg"
        >
          <Save className="size-6" aria-hidden="true" />
          {pending ? "Guardando..." : "Guardar precio"}
        </Button>
        {state.message ? (
          <p
            className={`text-base font-semibold ${
              state.ok ? "text-emerald-700" : "text-destructive"
            }`}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
