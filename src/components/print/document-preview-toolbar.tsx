"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, History, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { printWithPageSize } from "@/lib/print/apply-print-page-size";
import type { PrintPaperSize } from "@/lib/print/invoice-settings";

type DocumentPreviewToolbarProps = {
  backHref: string;
  backLabel: string;
  historyHref: string;
  historyLabel?: string;
  printLabel?: string;
  printPaperSize: PrintPaperSize;
  extraActions?: ReactNode;
};

export function DocumentPreviewToolbar({
  backHref,
  backLabel,
  historyHref,
  historyLabel = "Ir a historial",
  printLabel = "Imprimir",
  printPaperSize,
  extraActions,
}: DocumentPreviewToolbarProps) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("print") === "1") {
      printWithPageSize(printPaperSize);
    }
  }, [printPaperSize, searchParams]);

  return (
    <div className="grid gap-2 md:grid-cols-[repeat(3,minmax(150px,1fr))_auto] md:items-center">
      <Button
        asChild
        variant="outline"
        className="h-12 justify-center gap-2 px-4 text-base font-semibold"
      >
        <Link href={backHref}>
          <ArrowLeft className="size-5" aria-hidden="true" />
          {backLabel}
        </Link>
      </Button>

      <Button
        type="button"
        onClick={() => printWithPageSize(printPaperSize)}
        className="h-12 justify-center gap-2 px-4 text-base font-semibold"
      >
        <Printer className="size-5" aria-hidden="true" />
        {printLabel}
      </Button>

      <Button
        asChild
        variant="outline"
        className="h-12 justify-center gap-2 px-4 text-base font-semibold"
      >
        <Link href={historyHref}>
          <History className="size-5" aria-hidden="true" />
          {historyLabel}
        </Link>
      </Button>

      {extraActions ? (
        <div className="grid gap-2 md:flex md:justify-end">{extraActions}</div>
      ) : null}
    </div>
  );
}
