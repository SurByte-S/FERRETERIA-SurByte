"use client";

import { useActionState, useMemo, useState } from "react";
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
  const [newStockValue, setNewStockValue] = useState(String(product.stockQuantity));
  const [state, formAction, pending] = useActionState(
    adjustProductStockAction,
    initialState
  );
  const stockPreview = useMemo(() => {
    const nextStock = Number(newStockValue.replace(",", "."));

    if (!Number.isFinite(nextStock)) {
      return {
        nextStock: null,
        difference: null,
        message: "Escribi el stock final para ver la diferencia.",
      };
    }

    const difference = nextStock - product.stockQuantity;

    if (difference > 0) {
      return {
        nextStock,
        difference,
        message: `Vas a sumar ${difference} unidades.`,
      };
    }

    if (difference < 0) {
      return {
        nextStock,
        difference,
        message: `Vas a descontar ${Math.abs(difference)} unidades.`,
      };
    }

    return {
      nextStock,
      difference,
      message: "El stock no cambia.",
    };
  }, [newStockValue, product.stockQuantity]);

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
            value={newStockValue}
            onChange={(event) => setNewStockValue(event.target.value)}
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

      <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Stock actual</p>
          <p className="text-2xl font-bold">{product.stockQuantity}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Nuevo stock</p>
          <p className="text-2xl font-bold">
            {stockPreview.nextStock === null ? "-" : stockPreview.nextStock}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Diferencia</p>
          <p className="text-2xl font-bold">
            {stockPreview.difference === null ? "-" : stockPreview.difference}
          </p>
        </div>
        <p className="font-semibold md:col-span-3">{stockPreview.message}</p>
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
