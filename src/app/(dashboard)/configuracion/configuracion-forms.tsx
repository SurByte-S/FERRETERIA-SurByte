"use client";

import { useActionState } from "react";
import {
  BadgeCheck,
  Building2,
  CircleOff,
  Factory,
  Plus,
  RotateCcw,
  Save,
  Store,
} from "lucide-react";

import {
  createBrandConfigAction,
  createSupplierConfigAction,
  setBrandActiveConfigAction,
  updateBrandConfigAction,
  updateSupplierConfigAction,
  updateTenantBusinessAction,
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

export type TenantBusinessConfig = {
  name: string;
  slug: string;
  business_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
};

export type BrandConfigItem = {
  id: string;
  name: string;
  active: boolean;
  productsCount: number;
};

export type SupplierConfigItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

const initialState: ConfigActionState = {
  ok: false,
  message: "",
};

export function BusinessForm({ tenant }: { tenant: TenantBusinessConfig }) {
  const [state, formAction, pending] = useActionState(
    updateTenantBusinessAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconBox icon={Store} />
          <div className="min-w-0">
            <CardTitle>Datos del negocio</CardTitle>
            <CardDescription>
              Nombre, contacto y datos visibles de la ferreteria.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre de la ferreteria">
              <input
                name="name"
                defaultValue={tenant.name}
                required
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Slug">
              <input
                value={tenant.slug}
                readOnly
                className="h-11 rounded-lg border border-input bg-muted px-3 text-base text-muted-foreground"
              />
            </Field>
            <Field label="Razon social">
              <input
                name="business_name"
                defaultValue={tenant.business_name ?? ""}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="CUIT">
              <input
                name="tax_id"
                defaultValue={tenant.tax_id ?? ""}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Telefono / WhatsApp">
              <input
                name="phone"
                defaultValue={tenant.phone ?? ""}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                defaultValue={tenant.email ?? ""}
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
          </div>

          <Field label="Direccion">
            <input
              name="address"
              defaultValue={tenant.address ?? ""}
              className="h-11 rounded-lg border border-input bg-background px-3 text-base"
            />
          </Field>

          <Field
            label="Logo URL"
            help="Por ahora pega una URL de imagen. La carga de logo desde archivo se agregara mas adelante."
          >
            <input
              name="logo_url"
              defaultValue={tenant.logo_url ?? ""}
              className="h-11 rounded-lg border border-input bg-background px-3 text-base"
            />
          </Field>

          <FormFooter
            icon={Save}
            pending={pending}
            pendingLabel="Guardando..."
            submitLabel="Guardar negocio"
            state={state}
          />
        </form>
      </CardContent>
    </Card>
  );
}

export function BrandsPanel({ brands }: { brands: BrandConfigItem[] }) {
  const [state, formAction, pending] = useActionState(
    createBrandConfigAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconBox icon={BadgeCheck} />
          <div className="min-w-0">
            <CardTitle>Marcas</CardTitle>
            <CardDescription>
              Crear, renombrar y activar o desactivar marcas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Nueva marca">
            <input
              name="name"
              required
              className="h-11 rounded-lg border border-input bg-background px-3 text-base"
            />
          </Field>
          <FormFooter
            compact
            icon={Plus}
            pending={pending}
            pendingLabel="Creando..."
            submitLabel="Crear"
            state={state}
          />
        </form>

        <div className="grid gap-2">
          {brands.length === 0 ? (
            <EmptyText text="Todavia no hay marcas cargadas." />
          ) : (
            brands.map((brand) => (
              <BrandRow key={brand.id} brand={brand} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BrandRow({ brand }: { brand: BrandConfigItem }) {
  const [editState, editAction, editPending] = useActionState(
    updateBrandConfigAction,
    initialState
  );
  const [activeState, activeAction, activePending] = useActionState(
    setBrandActiveConfigAction,
    initialState
  );
  const nextActive = !brand.active;

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
      <form action={editAction} className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <input type="hidden" name="brandId" value={brand.id} />
        <Field
          label={`${brand.active ? "Activa" : "Inactiva"} · ${brand.productsCount} productos`}
        >
          <input
            name="name"
            defaultValue={brand.name}
            required
            className="h-10 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>
        <FormFooter
          compact
          icon={Save}
          pending={editPending}
          pendingLabel="Guardando..."
          submitLabel="Guardar"
          state={editState}
        />
      </form>

      <form action={activeAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="brandId" value={brand.id} />
        <input type="hidden" name="active" value={String(nextActive)} />
        <Button
          type="submit"
          disabled={activePending}
          variant="outline"
          className="h-9 gap-2 px-3 text-sm"
        >
          {nextActive ? (
            <RotateCcw className="size-4" aria-hidden="true" />
          ) : (
            <CircleOff className="size-4" aria-hidden="true" />
          )}
          {activePending
            ? "Actualizando..."
            : nextActive
              ? "Reactivar"
              : "Desactivar"}
        </Button>
        <StatusMessage state={activeState} />
      </form>
    </div>
  );
}

export function SuppliersPanel({
  suppliers,
}: {
  suppliers: SupplierConfigItem[];
}) {
  const [state, formAction, pending] = useActionState(
    createSupplierConfigAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconBox icon={Factory} />
          <div className="min-w-0">
            <CardTitle>Proveedores</CardTitle>
            <CardDescription>
              Crear y editar datos de contacto de proveedores.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre proveedor">
              <input
                name="name"
                required
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Telefono">
              <input
                name="phone"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
            <Field label="Direccion">
              <input
                name="address"
                className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              />
            </Field>
          </div>
          <Field label="Notas">
            <textarea
              name="notes"
              rows={2}
              className="rounded-lg border border-input bg-background px-3 py-2 text-base"
            />
          </Field>
          <FormFooter
            icon={Plus}
            pending={pending}
            pendingLabel="Creando..."
            submitLabel="Crear proveedor"
            state={state}
          />
        </form>

        <div className="grid gap-2">
          {suppliers.length === 0 ? (
            <EmptyText text="Todavia no hay proveedores cargados." />
          ) : (
            suppliers.map((supplier) => (
              <SupplierRow key={supplier.id} supplier={supplier} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SupplierRow({ supplier }: { supplier: SupplierConfigItem }) {
  const [state, formAction, pending] = useActionState(
    updateSupplierConfigAction,
    initialState
  );

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
      <input type="hidden" name="supplierId" value={supplier.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nombre">
          <input
            name="name"
            defaultValue={supplier.name}
            required
            className="h-10 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>
        <Field label="Telefono">
          <input
            name="phone"
            defaultValue={supplier.phone ?? ""}
            className="h-10 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            defaultValue={supplier.email ?? ""}
            className="h-10 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>
        <Field label="Direccion">
          <input
            name="address"
            defaultValue={supplier.address ?? ""}
            className="h-10 rounded-lg border border-input bg-background px-3 text-base"
          />
        </Field>
      </div>
      <Field label="Notas">
        <textarea
          name="notes"
          defaultValue={supplier.notes ?? ""}
          rows={2}
          className="rounded-lg border border-input bg-background px-3 py-2 text-base"
        />
      </Field>
      <FormFooter
        compact
        icon={Save}
        pending={pending}
        pendingLabel="Guardando..."
        submitLabel="Guardar proveedor"
        state={state}
      />
    </form>
  );
}

function Field({
  children,
  help,
  label,
}: {
  children: React.ReactNode;
  help?: string;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      {children}
      {help ? (
        <span className="text-xs font-semibold text-muted-foreground">
          {help}
        </span>
      ) : null}
    </label>
  );
}

function FormFooter({
  compact = false,
  icon: Icon,
  pending,
  pendingLabel,
  state,
  submitLabel,
}: {
  compact?: boolean;
  icon: typeof Save;
  pending: boolean;
  pendingLabel: string;
  state: ConfigActionState;
  submitLabel: string;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "flex flex-col gap-3 sm:flex-row sm:items-center"
      }
    >
      <Button
        type="submit"
        disabled={pending}
        className={compact ? "h-10 gap-2 px-3 text-sm" : "h-12 gap-2 px-5 text-base"}
      >
        <Icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
        {pending ? pendingLabel : submitLabel}
      </Button>
      <StatusMessage state={state} />
    </div>
  );
}

function StatusMessage({ state }: { state: ConfigActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={
        state.ok
          ? "text-sm font-semibold text-emerald-700"
          : "text-sm font-semibold text-destructive"
      }
    >
      {state.message}
    </p>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-3 text-sm font-semibold text-muted-foreground">
      {text}
    </p>
  );
}

function IconBox({ icon: Icon }: { icon: typeof Building2 }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon className="size-5" aria-hidden="true" />
    </div>
  );
}
