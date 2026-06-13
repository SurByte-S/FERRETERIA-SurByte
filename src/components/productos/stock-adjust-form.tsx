"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";

import {
  adjustProductStockAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";
import { formatStockQuantity } from "@/lib/format";
import type { ProductListItem } from "./product-types";

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

export function StockAdjustForm({
  product,
  onAdjusted,
}: {
  product: ProductListItem;
  onAdjusted?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
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
  const [confirmation, setConfirmation] = useState<{
    formData: FormData;
    nextStock: string;
  } | null>(null);
  const [state, formAction, pending] = useActionState(
    adjustProductStockAction,
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      const scrollContainer = formRef.current?.closest(".overflow-y-auto");

      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      } else {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      }

      const refreshTimeout = window.setTimeout(() => {
        router.refresh();
        onAdjusted?.();
      }, 250);

      return () => window.clearTimeout(refreshTimeout);
    }
  }, [onAdjusted, router, state.ok]);
  const stockPreview = useMemo(() => {
    const nextStock = Number(newStockValue);

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
  }, [newStockValue, product.stockQuantity]);
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
      nextStock: product.stockQuantity + quantityToAdd,
      message: `Vas a sumar ${formatStockQuantity(quantityToAdd)} unidades reales.`,
    };
  }, [
    defaultSaleUnit,
    product.saleUnits,
    product.stockQuantity,
    stockLoadQuantity,
    stockLoadSaleUnitId,
  ]);

  function submit(formData: FormData) {
    const addQuantity = String(formData.get("addStockQuantity") ?? "").trim();

    if (addQuantity) {
      formAction(formData);
      return;
    }

    const nextStock = String(formData.get("newStock") ?? "").trim();

    if (!nextStock) {
      formAction(formData);
      return;
    }

    setConfirmation({
      formData,
      nextStock,
    });
  }

  function updateNewStockValue(value: string) {
    setNewStockValue(value.replace(/[^\d.,]/g, ""));
  }

  function confirmStockAdjustment() {
    if (!confirmation) {
      return;
    }

    startTransition(() => {
      formAction(confirmation.formData);
      setConfirmation(null);
    });
  }

  return (
    <form
      ref={formRef}
      action={submit}
      className="grid gap-3 rounded-lg border border-border bg-background p-4"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="notes" value="Ajuste manual de stock" />

      <h3 className="text-base font-bold">Stock</h3>

      <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-2 md:grid-cols-4">
        <SummaryBlock
          label="Stock actual"
          value={formatStockQuantity(product.stockQuantity)}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 gap-2 bg-amber-600 px-4 text-base text-white hover:bg-amber-700"
        >
          <PackagePlus className="size-5" aria-hidden="true" />
          {pending ? "Actualizando..." : "Guardar cambios de stock"}
        </Button>
        {state.message ? (
          <p className="text-base font-semibold">{state.message}</p>
        ) : null}
      </div>

      {confirmation ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
            <p className="text-lg font-bold">Confirmar stock</p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              {product.name}
            </p>
            <p className="mt-4 rounded-lg bg-muted p-3 text-xl font-bold">
              Nuevo stock: {formatStockQuantity(Number(confirmation.nextStock))}
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                disabled={pending}
                onClick={confirmStockAdjustment}
                className="h-10 bg-emerald-700 px-4 text-base text-white hover:bg-emerald-800"
              >
                Confirmar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmation(null)}
                className="h-10 px-4 text-base"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function SummaryBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold">{value}</p>
    </div>
  );
}
