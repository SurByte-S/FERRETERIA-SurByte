"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintSaleButton() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      window.print();
    }
  }, [searchParams]);

  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="h-14 gap-2 px-6 text-lg"
    >
      <Printer className="size-6" aria-hidden="true" />
      Imprimir venta
    </Button>
  );
}
