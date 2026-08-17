"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { printWithPageSize } from "@/lib/print/apply-print-page-size";
import type { PrintPaperSize } from "@/lib/print/invoice-settings";

export function PrintSaleButton({
  printPaperSize = "a4",
}: {
  printPaperSize?: PrintPaperSize;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      printWithPageSize(printPaperSize);
    }
  }, [printPaperSize, searchParams]);

  return (
    <Button
      type="button"
      onClick={() => printWithPageSize(printPaperSize)}
      className="h-14 gap-2 px-6 text-lg"
    >
      <Printer className="size-6" aria-hidden="true" />
      Imprimir venta
    </Button>
  );
}
