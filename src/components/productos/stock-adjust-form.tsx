"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { formatStockQuantity } from "@/lib/format";
import type { ProductListItem } from "./product-types";

export type StockAdjustFormHandle = {
  getFormData: () => FormData | null;
  hasChanges: () => boolean;
  markSaved: () => void;
};

export const StockAdjustForm = forwardRef<
  StockAdjustFormHandle,
  { product: ProductListItem }
>(function StockAdjustForm({ product }, ref) {
  const formRef = useRef<HTMLFormElement>(null);
  const [baselineStock, setBaselineStock] = useState(product.stockQuantity);
  const [newStockValue, setNewStockValue] = useState(
    product.stockQuantity === 0 ? "" : String(product.stockQuantity)
  );
  const stockPreview = (() => {
    const nextStock = Number(newStockValue);

    if (!Number.isFinite(nextStock)) {
      return {
        nextStock: null,
        difference: null,
        message: "Escribi el stock final para ver la diferencia.",
      };
    }

    const difference = nextStock - baselineStock;
    if (difference > 0) {
      return {
        nextStock,
        difference,
        message: `Vas a sumar ${formatStockQuantity(difference)} unidades.`,
      };
    }

    if (difference < 0) {
      return {
        nextStock,
        difference,
        message: `Vas a descontar ${formatStockQuantity(Math.abs(difference))} unidades.`,
      };
    }

    return {
      nextStock,
      difference,
      message: "El stock no cambia.",
    };
  })();

  function updateNewStockValue(value: string) {
    setNewStockValue(value.replace(/[^\d.,]/g, ""));
  }

  useImperativeHandle(ref, () => ({
    getFormData: () =>
      formRef.current ? new FormData(formRef.current) : null,
    hasChanges: () => {
      if (!newStockValue.trim()) {
        return baselineStock !== 0;
      }

      const nextStock = Number(newStockValue.replace(",", "."));
      return (
        !Number.isFinite(nextStock) || nextStock !== baselineStock
      );
    },
    markSaved: () => {
      const nextStock = stockPreview.nextStock ?? baselineStock;
      setBaselineStock(nextStock);
      setNewStockValue(nextStock === 0 ? "" : String(nextStock));
    },
  }), [baselineStock, newStockValue, stockPreview.nextStock]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => event.preventDefault()}
      className="grid gap-3 rounded-lg border border-border bg-background p-4"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="notes" value="Ajuste manual de stock" />

      <h3 className="text-base font-bold">Stock</h3>

      <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-end">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-semibold text-muted-foreground">
            Stock actual
          </p>
          <p className="mt-1 truncate text-xl font-bold">
            {formatStockQuantity(baselineStock)}
          </p>
        </div>

        <label className="grid gap-2 text-base font-semibold">
          <span>Stock final contado</span>
          <input
            name="newStock"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            pattern="[0-9]*"
            value={newStockValue}
            onKeyDown={(event) => {
              if ([",", ".", "-", "+", "e", "E"].includes(event.key)) {
                event.preventDefault();
              }
            }}
            onChange={(event) => updateNewStockValue(event.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base"
          />
        </label>
      </div>

      <p className="text-sm font-semibold text-muted-foreground">
        {stockPreview.message}
      </p>

    </form>
  );
});
