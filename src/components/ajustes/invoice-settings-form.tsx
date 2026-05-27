"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Save } from "lucide-react";

import {
  saveInvoiceSettingsAction,
  type InvoiceSettingsActionState,
} from "@/app/(dashboard)/ajustes/actions";
import { Button } from "@/components/ui/button";

export type InvoiceSettingsFormValues = {
  fantasyName: string;
  legalName: string;
  taxId: string;
  ivaCondition: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  receiptFooter: string;
  receiptMessage: string;
};

const initialState: InvoiceSettingsActionState = {
  ok: false,
  message: "",
};

const inputClass =
  "h-14 rounded-md border-2 border-border bg-background px-3 text-lg font-semibold text-foreground shadow-sm";
const textareaClass =
  "min-h-24 rounded-md border-2 border-border bg-background px-3 py-2 text-lg font-semibold text-foreground shadow-sm";

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: keyof InvoiceSettingsFormValues;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-base font-bold text-foreground">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className={inputClass}
      />
    </label>
  );
}

export function InvoiceSettingsForm({
  initialValues,
}: {
  initialValues: InvoiceSettingsFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    saveInvoiceSettingsAction,
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <section className="rounded-md border-2 border-border bg-card">
        <div className="border-b-2 border-border bg-muted px-4 py-3">
          <h2 className="text-2xl font-black text-foreground">
            Datos principales
          </h2>
          <p className="text-base font-semibold text-muted-foreground">
            Datos que se imprimen arriba del comprobante.
          </p>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field
            label="Nombre de fantasia"
            name="fantasyName"
            defaultValue={initialValues.fantasyName}
          />
          <Field
            label="Razon social"
            name="legalName"
            defaultValue={initialValues.legalName}
          />
          <Field
            label="CUIT"
            name="taxId"
            defaultValue={initialValues.taxId}
          />
          <Field
            label="Condicion IVA"
            name="ivaCondition"
            defaultValue={initialValues.ivaCondition}
          />
          <Field
            label="Direccion"
            name="address"
            defaultValue={initialValues.address}
          />
          <Field
            label="Localidad"
            name="city"
            defaultValue={initialValues.city}
          />
          <Field
            label="Provincia"
            name="province"
            defaultValue={initialValues.province}
          />
          <Field
            label="Telefono"
            name="phone"
            defaultValue={initialValues.phone}
            type="tel"
          />
          <Field
            label="Email"
            name="email"
            defaultValue={initialValues.email}
            type="text"
          />
        </div>
      </section>

      <section className="rounded-md border-2 border-border bg-card">
        <div className="border-b-2 border-border bg-muted px-4 py-3">
          <h2 className="text-2xl font-black text-foreground">
            Datos de comprobante
          </h2>
          <p className="text-base font-semibold text-muted-foreground">
            Pie del comprobante y mensaje para el cliente.
          </p>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <label className="grid gap-2 text-base font-bold text-foreground">
            <span>Texto al pie</span>
            <textarea
              name="receiptFooter"
              defaultValue={initialValues.receiptFooter}
              className={textareaClass}
            />
          </label>
          <label className="grid gap-2 text-base font-bold text-foreground">
            <span>Mensaje de agradecimiento</span>
            <textarea
              name="receiptMessage"
              defaultValue={initialValues.receiptMessage}
              className={textareaClass}
            />
          </label>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-md border-2 border-border bg-secondary p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-6 text-base font-bold">
          {state.message ? (
            <p className={state.ok ? "text-foreground" : "text-destructive"}>
              {state.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            disabled={pending}
            className="h-14 gap-2 px-6 text-lg"
          >
            <Save className="size-5" aria-hidden="true" />
            {pending ? "Guardando..." : "Guardar datos de factura"}
          </Button>
          <Button
            asChild
            type="button"
            variant="outline"
            className="h-14 px-6 text-lg"
          >
            <Link href="/inicio">Volver a vender</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
