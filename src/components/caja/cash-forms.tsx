"use client";

import { useActionState } from "react";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";

import {
  closeCashSessionAction,
  openCashSessionAction,
  type CashActionState,
} from "@/app/(dashboard)/caja/actions";
import { Button } from "@/components/ui/button";

const initialState: CashActionState = {
  ok: false,
  message: "",
};

export function OpenCashForm() {
  const [state, formAction, pending] = useActionState(
    openCashSessionAction,
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <label className="grid gap-2 text-base font-semibold">
        <span>Monto inicial</span>
        <input
          name="openingAmount"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0"
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>

      <label className="grid gap-2 text-base font-semibold">
        <span>Nota opcional</span>
        <input
          name="notes"
          placeholder="Ej: apertura turno mañana"
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>

      <Button type="submit" disabled={pending} className="h-14 gap-2 px-6 text-lg">
        <UnlockKeyhole className="size-6" aria-hidden="true" />
        {pending ? "Abriendo..." : "Abrir caja"}
      </Button>

      {state.message ? <p className="text-base font-semibold">{state.message}</p> : null}
    </form>
  );
}

export function CloseCashForm({
  sessionId,
  expectedCash,
}: {
  sessionId: string;
  expectedCash: number;
}) {
  const [state, formAction, pending] = useActionState(
    closeCashSessionAction,
    initialState
  );

  function submit(formData: FormData) {
    const countedAmount = Number(formData.get("countedAmount"));

    if (!Number.isFinite(countedAmount) || countedAmount < 0) {
      formAction(formData);
      return;
    }

    const confirmed = window.confirm(
      `Vas a cerrar la caja con efectivo contado por ${new Intl.NumberFormat(
        "es-AR",
        {
          style: "currency",
          currency: "ARS",
          maximumFractionDigits: 2,
        }
      ).format(countedAmount)}. Queres continuar?`
    );

    if (confirmed) {
      formAction(formData);
    }
  }

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />

      <label className="grid gap-2 text-base font-semibold">
        <span>Efectivo contado</span>
        <input
          name="countedAmount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={expectedCash}
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>

      <label className="grid gap-2 text-base font-semibold">
        <span>Nota opcional</span>
        <input
          name="notes"
          placeholder="Ej: cierre sin diferencia"
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>

      <Button type="submit" disabled={pending} className="h-14 gap-2 px-6 text-lg">
        <LockKeyhole className="size-6" aria-hidden="true" />
        {pending ? "Cerrando..." : "Cerrar caja"}
      </Button>

      {state.message ? <p className="text-base font-semibold">{state.message}</p> : null}
    </form>
  );
}
