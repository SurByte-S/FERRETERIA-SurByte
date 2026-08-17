"use client";

import { useActionState } from "react";
import { FileText, Save } from "lucide-react";

import {
  upsertTenantInvoiceSettingsAction,
  type ConfigActionState,
} from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type TenantInvoiceSettingsConfig = {
  legal_name: string | null;
  cuit: string | null;
  iva_condition: string | null;
  fiscal_address: string | null;
  sale_point: string | null;
  gross_income: string | null;
  activity_start_date: string | null;
  invoice_footer_text: string | null;
  print_paper_size: "ticket_80mm" | "a5" | "a4";
};

const initialState: ConfigActionState = {
  ok: false,
  message: "",
};

const paperSizeOptions = [
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "ticket_80mm", label: "Ticket 80mm" },
] as const;

export function FacturacionForm({
  settings,
}: {
  settings: TenantInvoiceSettingsConfig;
}) {
  const [state, formAction, pending] = useActionState(
    upsertTenantInvoiceSettingsAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle>Facturacion e impresion</CardTitle>
            <CardDescription>
              Estos datos se usaran en comprobantes impresos en una proxima etapa.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5">
          <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <h2 className="text-base font-bold">Datos fiscales</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Razon social">
                <input
                  name="legal_name"
                  defaultValue={settings.legal_name ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="CUIT">
                <input
                  name="cuit"
                  defaultValue={settings.cuit ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="Condicion IVA">
                <input
                  name="iva_condition"
                  defaultValue={settings.iva_condition ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="Domicilio fiscal">
                <input
                  name="fiscal_address"
                  defaultValue={settings.fiscal_address ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="Punto de venta">
                <input
                  name="sale_point"
                  defaultValue={settings.sale_point ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="Ingresos brutos">
                <input
                  name="gross_income"
                  defaultValue={settings.gross_income ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="Inicio de actividades">
                <input
                  name="activity_start_date"
                  type="date"
                  defaultValue={settings.activity_start_date ?? ""}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </Field>
            </div>
            <Field label="Texto al pie del comprobante">
              <textarea
                name="invoice_footer_text"
                defaultValue={settings.invoice_footer_text ?? ""}
                rows={4}
                className="rounded-lg border border-input bg-background px-3 py-2 text-base"
              />
            </Field>
          </section>

          <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <h2 className="text-base font-bold">Impresion</h2>
            <Field label="Tamano de papel">
              <select
                name="print_paper_size"
                defaultValue={settings.print_paper_size}
                required
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              >
                {paperSizeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="rounded-lg border border-primary/30 bg-card p-3 text-sm font-semibold text-muted-foreground">
              Estos datos quedaran guardados. La aplicacion del tamano de
              impresion a los comprobantes se hara en una proxima etapa.
            </p>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="submit"
              disabled={pending}
              className="h-12 gap-2 px-5 text-base"
            >
              <Save className="size-5" aria-hidden="true" />
              {pending ? "Guardando..." : "Guardar facturacion"}
            </Button>
            {state.message ? (
              <p
                className={
                  state.ok
                    ? "text-sm font-semibold text-emerald-700"
                    : "text-sm font-semibold text-destructive"
                }
              >
                {state.message}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      {children}
    </label>
  );
}
