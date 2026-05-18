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

export function StockAdjustForm({ product }: { product: ProductListItem }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [newStockValue, setNewStockValue] = useState(
    product.stockQuantity === 0 ? "" : String(product.stockQuantity)
  );
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
      }, 250);

      return () => window.clearTimeout(refreshTimeout);
    }
  }, [router, state.ok]);
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

  function submit(formData: FormData) {
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
    setNewStockValue(value.replace(/\D/g, ""));
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
      className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4"
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="notes" value="Ajuste manual de stock" />

      <div className="grid gap-4 md:max-w-xs">
        <label className="grid gap-2 text-base font-semibold">
          <span>Stock final</span>
          <input
            name="newStock"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            pattern="[0-9]*"
            value={newStockValue}
            placeholder="0"
            onKeyDown={(event) => {
              if ([",", ".", "-", "+", "e", "E"].includes(event.key)) {
                event.preventDefault();
              }
            }}
            onChange={(event) => updateNewStockValue(event.target.value)}
            className="h-12 rounded-lg border border-input bg-background px-3 text-base"
          />
        </label>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Stock actual</p>
          <p className="text-2xl font-bold">
            {formatStockQuantity(product.stockQuantity)}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Nuevo stock</p>
          <p className="text-2xl font-bold">
            {stockPreview.nextStock === null
              ? "-"
              : formatStockQuantity(stockPreview.nextStock)}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Diferencia</p>
          <p className="text-2xl font-bold">
            {stockPreview.difference === null
              ? "-"
              : formatStockQuantity(stockPreview.difference)}
          </p>
        </div>
        <p className="font-semibold md:col-span-3">{stockPreview.message}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pending}
          className="h-14 gap-2 bg-amber-600 px-6 text-lg text-white hover:bg-amber-700"
        >
          <PackagePlus className="size-6" aria-hidden="true" />
          {pending ? "Actualizando..." : "Guardar ajuste de stock"}
        </Button>
        {state.message ? (
          <p className="text-base font-semibold">{state.message}</p>
        ) : null}
      </div>

      {confirmation ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-lg">
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
                className="h-11 bg-emerald-700 px-4 text-white hover:bg-emerald-800"
              >
                Confirmar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmation(null)}
                className="h-11 px-4"
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
