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
        <span className="text-foreground">Monto inicial</span>
        <input
          name="openingAmount"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0"
          className="h-14 rounded-md border-2 border-border bg-background px-3 font-mono text-2xl font-bold tabular-nums text-foreground"
        />
      </label>

      <Button
        type="submit"
        disabled={pending}
        className="h-14 gap-2 px-6 text-lg shadow-sm"
      >
        <UnlockKeyhole className="size-6" aria-hidden="true" />
        {pending ? "Abriendo..." : "Abrir caja"}
      </Button>

      {state.message ? (
        <p className="text-base font-semibold">{state.message}</p>
      ) : null}
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
  const expectedCashLabel = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(expectedCash);

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

      <div className="rounded-md border-2 border-border bg-background p-4">
        <p className="text-sm font-bold uppercase text-muted-foreground">
          Efectivo esperado
        </p>
        <p className="mt-2 font-mono text-3xl font-black tabular-nums text-foreground">
          {expectedCashLabel}
        </p>
      </div>

      <p className="rounded-md border border-border bg-secondary px-3 py-2 text-base font-semibold text-foreground">
        Revisa el efectivo contado antes de cerrar.
      </p>

      <label className="grid gap-2 text-base font-semibold">
        <span className="text-foreground">Efectivo contado</span>
        <input
          name="countedAmount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={expectedCash}
          className="h-16 rounded-md border-2 border-border bg-background px-3 font-mono text-3xl font-black tabular-nums text-foreground"
        />
      </label>

      <Button
        type="submit"
        disabled={pending}
        className="h-16 gap-2 bg-destructive/10 px-6 text-xl text-destructive shadow-sm hover:bg-destructive/20"
      >
        <LockKeyhole className="size-6" aria-hidden="true" />
        {pending ? "Cerrando..." : "Cerrar caja"}
      </Button>

      {state.message ? (
        <p className="text-base font-semibold">{state.message}</p>
      ) : null}
    </form>
  );
}
