"use client";

import { useActionState } from "react";
import {
  BadgeCheck,
  Building2,
  CircleOff,
  Factory,
  ImageUp,
  MonitorCog,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Store,
  Tags,
  Type,
} from "lucide-react";

import {
  createBrandConfigAction,
  createCategoryConfigAction,
  createSupplierConfigAction,
  setBrandActiveConfigAction,
  setCategoryActiveConfigAction,
  updateBrandConfigAction,
  updateCategoryConfigAction,
  updateSupplierConfigAction,
  updateTenantBusinessAction,
  updateTenantUiSettingsAction,
  uploadTenantLogoAction,
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

export type CategoryConfigItem = {
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

export type ThemePreset = "azul_clasico" | "verde_comercio" | "gris_sobrio";
export type FontPreset = "sistema" | "legible" | "compacta";
export type ColorMode = "claro" | "oscuro";

export type TenantUiSettingsConfig = {
  color_mode: ColorMode;
  font_preset: FontPreset;
  theme_preset: ThemePreset;
};

const themeOptions: { label: string; value: ThemePreset }[] = [
  { label: "Azul clasico", value: "azul_clasico" },
  { label: "Verde comercio", value: "verde_comercio" },
  { label: "Gris sobrio", value: "gris_sobrio" },
];

const fontOptions: { label: string; value: FontPreset }[] = [
  { label: "Sistema", value: "sistema" },
  { label: "Mas legible", value: "legible" },
  { label: "Compacta", value: "compacta" },
];

const modeOptions: { label: string; value: ColorMode }[] = [
  { label: "Claro", value: "claro" },
  { label: "Oscuro", value: "oscuro" },
];

const initialState: ConfigActionState = {
  ok: false,
  message: "",
};

export function BusinessForm({ tenant }: { tenant: TenantBusinessConfig }) {
  const [state, formAction, pending] = useActionState(
    updateTenantBusinessAction,
    initialState
  );
  const [logoState, logoFormAction, logoPending] = useActionState(
    uploadTenantLogoAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconBox icon={Store} />
          <div className="min-w-0">
            <CardTitle>Datos del negocio</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
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

        <form
          action={logoFormAction}
          className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4"
        >
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
              {tenant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tenant.logo_url}
                  alt="Logo actual"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <Store className="size-8 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
            <div className="grid gap-1">
              <h3 className="text-base font-bold">Logo del negocio</h3>
              <p className="text-sm font-semibold text-muted-foreground">
                {tenant.logo_url ? "Logo actual" : "Todavia no hay logo cargado."}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                Formatos permitidos: JPG, PNG o WEBP. Maximo 2 MB.
              </p>
            </div>
          </div>

          <Field label="Subir logo">
            <input
              name="logo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="w-full rounded-lg border border-input bg-background px-3 py-3 text-base"
            />
          </Field>

          <FormFooter
            icon={ImageUp}
            pending={logoPending}
            pendingLabel="Subiendo..."
            submitLabel="Subir logo"
            state={logoState}
          />
        </form>
      </CardContent>
    </Card>
  );
}

export function PersonalizacionForm({
  settings,
}: {
  settings: TenantUiSettingsConfig;
}) {
  const [state, formAction, pending] = useActionState(
    updateTenantUiSettingsAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconBox icon={Palette} />
          <div className="min-w-0">
            <CardTitle>Personalizacion</CardTitle>
            <CardDescription>
              Colores, letra y apariencia del sistema.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <Palette className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-bold">Color del sistema</h2>
              </div>
              <OptionGroup
                name="theme_preset"
                options={themeOptions}
                value={settings.theme_preset}
              />
            </section>

            <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <Type className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-bold">Letra</h2>
              </div>
              <OptionGroup
                name="font_preset"
                options={fontOptions}
                value={settings.font_preset}
              />
            </section>

            <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <MonitorCog className="size-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-bold">Modo de pantalla</h2>
              </div>
              <OptionGroup
                name="color_mode"
                options={modeOptions}
                value={settings.color_mode}
              />
            </section>
          </div>

          <section className="grid gap-3 rounded-lg border border-border bg-background p-3">
            <h2 className="text-base font-bold">Vista previa</h2>
            <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid gap-1">
                <p className="text-base font-bold text-foreground">
                  Tarjeta de ejemplo
                </p>
                <p className="text-sm font-semibold text-muted-foreground">
                  Asi se veran los textos, bordes y botones principales.
                </p>
              </div>
              <Button type="button" className="h-11 px-4 text-base">
                Boton de ejemplo
              </Button>
            </div>
          </section>

          <FormFooter
            icon={Save}
            pending={pending}
            pendingLabel="Guardando..."
            submitLabel="Guardar personalizacion"
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

export function CategoriesPanel({
  categories,
}: {
  categories: CategoryConfigItem[];
}) {
  const [state, formAction, pending] = useActionState(
    createCategoryConfigAction,
    initialState
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconBox icon={Tags} />
          <div className="min-w-0">
            <CardTitle>Categorias</CardTitle>
            <CardDescription>
              Crear, renombrar y activar o desactivar categorias.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Nombre de la categoria">
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
            submitLabel="Agregar categoria"
            state={state}
          />
        </form>

        <div className="grid gap-2">
          {categories.length === 0 ? (
            <EmptyText text="Todavia no hay categorias cargadas." />
          ) : (
            categories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryRow({ category }: { category: CategoryConfigItem }) {
  const [editState, editAction, editPending] = useActionState(
    updateCategoryConfigAction,
    initialState
  );
  const [activeState, activeAction, activePending] = useActionState(
    setCategoryActiveConfigAction,
    initialState
  );
  const nextActive = !category.active;

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
      <form action={editAction} className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <input type="hidden" name="categoryId" value={category.id} />
        <Field
          label={`${category.active ? "Activa" : "Inactiva"} - ${category.productsCount} productos`}
        >
          <input
            name="name"
            defaultValue={category.name}
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
        <input type="hidden" name="categoryId" value={category.id} />
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

function OptionGroup<TValue extends string>({
  name,
  options,
  value,
}: {
  name: string;
  options: { label: string; value: TValue }[];
  value: TValue;
}) {
  return (
    <div className="grid gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 text-base font-semibold"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === value}
            className="size-4"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
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
