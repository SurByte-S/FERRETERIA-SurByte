"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteQuoteAction } from "@/app/(dashboard)/presupuestos/[id]/actions";
import { DeleteConfirmDialog } from "@/components/common/delete-confirm-dialog";
import { Button } from "@/components/ui/button";

const initialState = {
  ok: false,
  message: "",
};

export function DeleteQuoteButton({
  isConverted,
  quoteId,
}: {
  isConverted: boolean;
  quoteId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteQuoteAction,
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      router.push("/presupuestos");
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="h-11 gap-2 bg-red-600 px-4 text-base text-white hover:bg-red-700 focus-visible:ring-red-500"
      >
        <Trash2 className="size-5" aria-hidden="true" />
        Eliminar presupuesto
      </Button>

      {state.message && !state.ok ? (
        <p className="text-sm font-semibold text-destructive">{state.message}</p>
      ) : null}

      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Eliminar presupuesto"
        description="Vas a eliminar este presupuesto del listado. Si ya fue convertido en venta, la venta no se borrara."
        confirmLabel="Eliminar presupuesto"
        isPending={pending}
        onConfirm={() => {
          const formData = new FormData();
          formData.set("quoteId", quoteId);
          startTransition(() => formAction(formData));
        }}
      >
        {isConverted ? (
          <p className="rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
            Este presupuesto ya fue convertido en venta. Solo se ocultara el
            presupuesto; la venta asociada se conserva.
          </p>
        ) : null}
        {state.message && !state.ok ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {state.message}
          </p>
        ) : null}
      </DeleteConfirmDialog>
    </>
  );
}
