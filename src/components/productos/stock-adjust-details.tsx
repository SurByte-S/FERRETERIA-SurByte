"use client";

import { useRef } from "react";
import { PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductListItem } from "./product-types";
import { StockAdjustForm } from "./stock-adjust-form";

export function StockAdjustDetails({ product }: { product: ProductListItem }) {
  const contentRef = useRef<HTMLDivElement>(null);

  function handleToggle(event: React.ToggleEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open) {
      return;
    }

    window.setTimeout(() => {
      contentRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }

  return (
    <details onToggle={handleToggle}>
      <summary className="list-none">
        <Button asChild className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-6 xl:text-lg">
          <span>
            <PackagePlus className="size-6" aria-hidden="true" />
            Ajustar stock
          </span>
        </Button>
      </summary>
      <div ref={contentRef}>
        <StockAdjustForm product={product} />
      </div>
    </details>
  );
}
