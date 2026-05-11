"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/(dashboard)/clientes/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type CustomerFormValue = {
  id?: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

export function CustomerForm({ customer }: { customer?: CustomerFormValue }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const isEditing = Boolean(customer?.id);

  function submit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      const result =
        isEditing && customer?.id
          ? await updateCustomerAction(customer.id, formData)
          : await createCustomerAction(formData);

      if (result.ok && result.customerId) {
        router.push(`/clientes/${result.customerId}`);
        return;
      }

      setMessage(result.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Editar cliente" : "Nuevo cliente"}</CardTitle>
        <CardDescription>
          Carga solo los datos utiles para encontrarlo rapido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-4">
          <Field label="Nombre obligatorio">
            <input
              name="name"
              defaultValue={customer?.name ?? ""}
              required
              className="h-12 rounded-lg border border-input bg-background px-3 text-base"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Telefono">
              <input
                name="phone"
                defaultValue={customer?.phone ?? ""}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                defaultValue={customer?.email ?? ""}
                className="h-12 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
          </div>

          <Field label="Direccion">
            <input
              name="address"
              defaultValue={customer?.address ?? ""}
              className="h-12 rounded-lg border border-input bg-background px-3 text-base"
            />
          </Field>

          <Field label="Notas">
            <textarea
              name="notes"
              defaultValue={customer?.notes ?? ""}
              rows={4}
              className="rounded-lg border border-input bg-background px-3 py-3 text-base"
            />
          </Field>

          {message ? (
            <p className="rounded-lg border border-destructive/40 p-3 text-base font-semibold">
              {message}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending}
            className="h-14 w-full gap-2 text-lg sm:w-fit sm:px-6"
          >
            <Save className="size-6" aria-hidden="true" />
            {pending ? "Guardando..." : "Guardar cliente"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-base font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}
