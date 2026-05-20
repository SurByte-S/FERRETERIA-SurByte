"use client";

import { useState } from "react";
import { PackagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductListItem } from "./product-types";
import { StockAdjustForm } from "./stock-adjust-form";

export function StockAdjustDetails({ product }: { product: ProductListItem }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 w-full gap-1 px-2 text-xs xl:h-11 xl:px-4 xl:text-sm"
      >
        <PackagePlus className="size-4" aria-hidden="true" />
        Ajustar stock
      </Button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-xl sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">Ajustar stock</p>
                <p className="truncate text-sm font-semibold text-muted-foreground">
                  {product.name}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <StockAdjustForm product={product} onAdjusted={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
