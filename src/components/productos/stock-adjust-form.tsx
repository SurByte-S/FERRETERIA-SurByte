"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";

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
  const defaultSaleUnit = useMemo(
    () =>
      product.saleUnits.find((unit) => unit.isDefault && unit.active) ??
      product.saleUnits.find((unit) => unit.active) ?? {
        id: "",
        name: "Unidad",
        quantityInBaseUnit: 1,
        salePrice: product.salePrice ?? 0,
        barcode: "",
        isDefault: true,
        active: true,
      },
    [product.salePrice, product.saleUnits]
  );
  const [stockLoadQuantity, setStockLoadQuantity] = useState("");
  const [stockLoadSaleUnitId, setStockLoadSaleUnitId] = useState(defaultSaleUnit.id);
  const stockPreview = useMemo(() => {
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
  }, [baselineStock, newStockValue]);
  const stockLoadPreview = useMemo(() => {
    const quantity = Number(stockLoadQuantity);
    const saleUnit =
      product.saleUnits.find((unit) => unit.id === stockLoadSaleUnitId) ??
      defaultSaleUnit;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        quantityToAdd: null,
        nextStock: null,
        message: "Escribi una cantidad para sumar stock por presentacion.",
      };
    }

    const quantityToAdd = quantity * saleUnit.quantityInBaseUnit;

    return {
      quantityToAdd,
      nextStock: baselineStock + quantityToAdd,
      message: `Vas a sumar ${formatStockQuantity(quantityToAdd)} unidades reales.`,
    };
  }, [
    defaultSaleUnit,
    product.saleUnits,
    baselineStock,
    stockLoadQuantity,
    stockLoadSaleUnitId,
  ]);

  function updateNewStockValue(value: string) {
    setNewStockValue(value.replace(/[^\d.,]/g, ""));
  }

  useImperativeHandle(ref, () => ({
    getFormData: () =>
      formRef.current ? new FormData(formRef.current) : null,
    hasChanges: () => {
      if (stockLoadQuantity.trim()) {
        return true;
      }

      if (!newStockValue.trim()) {
        return baselineStock !== 0;
      }

      const nextStock = Number(newStockValue.replace(",", "."));
      return (
        !Number.isFinite(nextStock) || nextStock !== baselineStock
      );
    },
    markSaved: () => {
      const nextStock =
        stockLoadPreview.nextStock ?? stockPreview.nextStock ?? baselineStock;
      setBaselineStock(nextStock);
      setNewStockValue(nextStock === 0 ? "" : String(nextStock));
      setStockLoadQuantity("");
    },
  }), [baselineStock, newStockValue, stockLoadPreview.nextStock, stockLoadQuantity, stockPreview.nextStock]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => event.preventDefault()}
      className="grid gap-3 rounded-lg border border-border bg-background p-4"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="notes" value="Ajuste manual de stock" />

      <h3 className="text-base font-bold">Stock</h3>

      <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-2 md:grid-cols-4">
        <SummaryBlock
          label="Stock actual"
          value={formatStockQuantity(baselineStock)}
        />
        <SummaryBlock
          label="Se agregan"
          value={
            stockLoadPreview.quantityToAdd === null
              ? "0"
              : formatStockQuantity(stockLoadPreview.quantityToAdd)
          }
        />
        <SummaryBlock
          label="Stock final"
          value={
            stockLoadPreview.nextStock !== null
              ? formatStockQuantity(stockLoadPreview.nextStock)
              : stockPreview.nextStock === null
              ? "-"
              : formatStockQuantity(stockPreview.nextStock)
          }
        />
        <SummaryBlock
          label="Diferencia"
          value={
            stockPreview.difference === null
              ? "-"
              : formatStockQuantity(stockPreview.difference)
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <h4 className="text-base font-bold">Entrada de mercaderia</h4>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Elegi la presentacion y escribi cuantas unidades entraron al local.
            </p>
          </div>
          <label className="grid gap-1.5 text-base font-semibold">
            <span>Presentacion de carga</span>
            <select
              name="stockLoadSaleUnitId"
              value={stockLoadSaleUnitId}
              onChange={(event) => setStockLoadSaleUnitId(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-base"
            >
              {(product.saleUnits.length > 0
                ? product.saleUnits.filter((unit) => unit.active)
                : [defaultSaleUnit]
              ).map((unit) => (
                <option key={unit.id || "fallback"} value={unit.id}>
                  {unit.name} x {formatStockQuantity(unit.quantityInBaseUnit)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-base font-semibold">
            <span>Cantidad que entra</span>
            <input
              name="addStockQuantity"
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={stockLoadQuantity}
              onChange={(event) => setStockLoadQuantity(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-base"
            />
          </label>
          <p className="text-sm font-semibold text-muted-foreground">
            {stockLoadPreview.message}
          </p>
        </section>

        <section className="grid content-start gap-3 rounded-lg border border-border bg-background p-3">
          <div>
            <h4 className="text-base font-bold">Ajuste manual de conteo</h4>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Usalo solo si contaste fisicamente el producto y queres corregir el stock final.
            </p>
          </div>
          <label className="grid gap-1.5 text-base font-semibold">
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
              className="h-10 rounded-lg border border-input bg-background px-3 text-base"
            />
          </label>
          <p className="text-sm font-semibold text-muted-foreground">
            {stockPreview.message}
          </p>
        </section>
      </div>

    </form>
  );
});

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold">{value}</p>
    </div>
  );
}
