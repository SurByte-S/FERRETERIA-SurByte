"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";

import { registerCustomerPaymentAction } from "@/app/(dashboard)/clientes/actions";
import { Button } from "@/components/ui/button";

export function CustomerPaymentForm({
  customerId,
  balance,
}: {
  customerId: string;
  balance: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const amount = Number(formData.get("amount"));

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Ingresa un importe mayor a cero.");
      return;
    }

    const confirmed = window.confirm(
      `Vas a registrar un pago por ${new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 2,
      }).format(amount)}. Queres continuar?`
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      const result = await registerCustomerPaymentAction(customerId, formData);
      setMessage(result.message);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <form action={submit} className="grid gap-3 rounded-lg border border-border p-4">
      <label className="grid gap-2 text-base font-semibold">
        <span>Importe del pago</span>
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={balance > 0 ? balance : ""}
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>
      <label className="grid gap-2 text-base font-semibold">
        <span>Nota opcional</span>
        <input
          name="notes"
          placeholder="Ej: pago en efectivo"
          className="h-12 rounded-lg border border-input bg-background px-3 text-base"
        />
      </label>
      <Button type="submit" disabled={pending} className="h-14 gap-2 text-lg">
        <HandCoins className="size-6" aria-hidden="true" />
        {pending ? "Registrando..." : "Registrar pago"}
      </Button>
      {message ? <p className="text-base font-semibold">{message}</p> : null}
    </form>
  );
}
