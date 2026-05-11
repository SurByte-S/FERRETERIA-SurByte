"use client";

import { useActionState } from "react";
import { PackagePlus } from "lucide-react";

import {
  adjustProductStockAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";
import type { ProductListItem } from "./product-types";

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

export function StockAdjustForm({ product }: { product: ProductListItem }) {
  const [state, formAction, pending] = useActionState(
    adjustProductStockAction,
    initialState
  );

  function submit(formData: FormData) {
    const notes = String(formData.get("notes") ?? "").trim();
    const nextStock = String(formData.get("newStock") ?? "").trim();

    if (!notes || !nextStock) {
      formAction(formData);
      return;
    }

    const confirmed = window.confirm(
      `Vas a dejar el stock de ${product.name} en ${nextStock}. Queres continuar?`
    );

    if (confirmed) {
      formAction(formData);
    }
  }

  return (
    <form
      action={submit}
      className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4"
    >
      <input type="hidden" name="productId" value={product.id} />

      <div className="grid gap-4 md:grid-cols-[180px_1fr]">
        <label className="grid gap-2 text-base font-semibold">
          <span>Stock final</span>
          <input
            name="newStock"
            type="number"
            step="0.001"
            defaultValue={product.stockQuantity}
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </label>

        <label className="grid gap-2 text-base font-semibold">
          <span>Motivo obligatorio</span>
          <input
            name="notes"
            placeholder="Ej: recuento de deposito, carga inicial"
            required
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending} className="h-14 gap-2 px-6 text-lg">
          <PackagePlus className="size-6" aria-hidden="true" />
          {pending ? "Actualizando..." : "Guardar ajuste de stock"}
        </Button>
        {state.message ? (
          <p className="text-base font-semibold">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
