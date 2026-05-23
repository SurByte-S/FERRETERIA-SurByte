"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteCustomerAction } from "@/app/(dashboard)/clientes/actions";
import { DeleteConfirmDialog } from "@/components/common/delete-confirm-dialog";
import { Button } from "@/components/ui/button";

const initialState = {
  ok: false,
  message: "",
};

export function DeleteCustomerButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteCustomerAction,
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      router.push("/clientes");
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="h-14 gap-2 bg-red-600 px-6 text-lg text-white hover:bg-red-700 focus-visible:ring-red-500"
      >
        <Trash2 className="size-6" aria-hidden="true" />
        Eliminar cliente
      </Button>

      {state.message && !state.ok ? (
        <p className="text-sm font-semibold text-destructive">{state.message}</p>
      ) : null}

      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Eliminar cliente"
        description="Vas a eliminar este cliente. No aparecera en el listado, pero las ventas y presupuestos asociados se conservaran."
        confirmLabel="Eliminar cliente"
        isPending={pending}
        onConfirm={() => {
          const formData = new FormData();
          formData.set("customerId", customerId);
          startTransition(() => formAction(formData));
        }}
      />
    </>
  );
}
