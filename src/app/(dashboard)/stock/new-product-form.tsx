"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Save, X } from "lucide-react";

import {
  createProductAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";

type CatalogOption = {
  id: string;
  name: string;
};

type NewProductFormProps = {
  brands: CatalogOption[];
  canCreate: boolean;
  suppliers: CatalogOption[];
};

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

export function NewProductForm({
  brands,
  canCreate,
  suppliers,
}: NewProductFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    createProductAction,
    initialState
  );
  const [costWithoutTax, setCostWithoutTax] = useState("");
  const [taxRate, setTaxRate] = useState("21");
  const [costWithTax, setCostWithTax] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const calculatedPrice = useMemo(() => {
    if (!costWithoutTax.trim()) {
      return null;
    }

    const cost = Number(costWithoutTax);
    const tax = Number(taxRate);

    if (!Number.isFinite(cost) || !Number.isFinite(tax)) {
      return null;
    }

    return cost * (1 + tax / 100);
  }, [costWithoutTax, taxRate]);
  function syncCalculatedPrice(nextCostWithoutTax: string, nextTaxRate: string) {
    const cost = Number(nextCostWithoutTax);
    const tax = Number(nextTaxRate);

    if (!nextCostWithoutTax.trim() || !Number.isFinite(cost) || !Number.isFinite(tax)) {
      return;
    }

    const calculated = String((cost * (1 + tax / 100)).toFixed(2));
    setCostWithTax(calculated);
    setSalePrice(calculated);
  }

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const closeTimeout = window.setTimeout(() => {
        setFormKey((current) => current + 1);
        setCostWithoutTax("");
        setTaxRate("21");
        setCostWithTax("");
        setSalePrice("");
        setOpen(false);
      }, 350);

      return () => window.clearTimeout(closeTimeout);
    }
  }, [router, state.ok]);

  if (!canCreate) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-6 xl:text-lg"
      >
        <PackagePlus className="size-5" aria-hidden="true" />
        Nuevo producto
      </Button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-xl sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">Nuevo producto</p>
                <p className="text-sm font-semibold text-muted-foreground">
                  Carga manual para productos que todavia no existen.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <form key={formKey} action={formAction} className="mt-4 grid gap-4">
              <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                <h3 className="text-base font-bold">Datos principales</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Nombre" name="name" required />
                  <TextField label="SKU / codigo interno" name="sku" required />
                  <TextField label="Codigo de barras" name="barcode" />
                  <TextField label="Unidad" name="unit" defaultValue="unidad" />
                  <label className="grid gap-2 text-sm font-semibold md:col-span-2">
                    <span>Descripcion</span>
                    <textarea
                      name="description"
                      rows={3}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-base"
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      name="active"
                      value="true"
                      defaultChecked
                      className="size-5"
                    />
                    Activo
                  </label>
                </div>
              </section>

              <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                <h3 className="text-base font-bold">Clasificacion</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    label="Marca"
                    name="brandId"
                    options={brands}
                    placeholder="Sin marca"
                  />
                  <SelectField
                    label="Proveedor"
                    name="supplierId"
                    options={suppliers}
                    placeholder="Sin proveedor"
                  />
                </div>
              </section>

              <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                <h3 className="text-base font-bold">Precio</h3>
                <div className="grid gap-3 md:grid-cols-4">
                  <NumberField
                    label="Costo sin IVA"
                    name="costWithoutTax"
                    value={costWithoutTax}
                    onChange={(value) => {
                      setCostWithoutTax(value);
                      syncCalculatedPrice(value, taxRate);
                    }}
                    step="0.01"
                  />
                  <NumberField
                    label="IVA %"
                    name="taxRate"
                    value={taxRate}
                    onChange={(value) => {
                      setTaxRate(value);
                      syncCalculatedPrice(costWithoutTax, value);
                    }}
                    step="0.01"
                  />
                  <NumberField
                    label="Costo con IVA"
                    name="costWithTax"
                    value={costWithTax}
                    onChange={setCostWithTax}
                    placeholder={
                      calculatedPrice === null
                        ? ""
                        : String(calculatedPrice.toFixed(2))
                    }
                    step="0.01"
                  />
                  <NumberField
                    label="Precio de venta"
                    name="salePrice"
                    value={salePrice}
                    onChange={setSalePrice}
                    placeholder={
                      calculatedPrice === null ? "" : String(calculatedPrice.toFixed(2))
                    }
                    step="0.01"
                  />
                </div>
              </section>

              <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                <h3 className="text-base font-bold">Stock inicial</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="Stock inicial"
                    name="stockQuantity"
                    defaultValue="0"
                    step="1"
                  />
                  <NumberField
                    label="Stock minimo"
                    name="minStock"
                    defaultValue="0"
                    step="1"
                  />
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  disabled={pending}
                  className="h-11 gap-2 px-4 text-base"
                >
                  <Save className="size-5" aria-hidden="true" />
                  {pending ? "Creando..." : "Crear producto"}
                </Button>
                {state.message ? (
                  <p
                    className={`text-base font-semibold ${
                      state.ok ? "text-emerald-700" : "text-destructive"
                    }`}
                  >
                    {state.message}
                  </p>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TextField({
  defaultValue,
  label,
  name,
  required = false,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="h-11 rounded-lg border border-input bg-background px-3 text-base"
      />
    </label>
  );
}

function NumberField({
  defaultValue,
  label,
  name,
  onChange,
  placeholder,
  step,
  value,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  step: string;
  value?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        placeholder={placeholder}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="h-11 rounded-lg border border-input bg-background px-3 text-base"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  options: CatalogOption[];
  placeholder: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      <select
        name={name}
        defaultValue=""
        className="h-11 rounded-lg border border-input bg-background px-3 text-base"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
