"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Save, X } from "lucide-react";

import {
  createProductAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";
import { CatalogSelectWithCreate } from "@/components/productos/catalog-select-with-create";
import { SaleUnitsEditor } from "@/components/productos/sale-units-editor";

type CatalogOption = {
  id: string;
  name: string;
};

type NewProductFormProps = {
  brands: CatalogOption[];
  canCreate: boolean;
  initialBarcode?: string;
  initialName?: string;
  initialSku?: string;
  suppliers: CatalogOption[];
  triggerLabel?: string;
};

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

function numberValue(value: string) {
  return Number(value.replace(",", "."));
}

function moneyValue(value: number) {
  return value.toFixed(2);
}

export function NewProductForm({
  brands,
  canCreate,
  initialBarcode = "",
  initialName = "",
  initialSku = "",
  suppliers,
  triggerLabel = "Nuevo producto",
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
  const [profitMarginPercent, setProfitMarginPercent] = useState("0");
  const [salePrice, setSalePrice] = useState("");
  const calculatedCostWithTax = useMemo(() => {
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
  function calculateSalePrice(nextCostWithTax: string, nextProfitMargin: string) {
    const cost = numberValue(nextCostWithTax);
    const margin = numberValue(nextProfitMargin);

    if (!nextCostWithTax.trim() || !Number.isFinite(cost) || !Number.isFinite(margin)) {
      return "";
    }

    return moneyValue(cost * (1 + margin / 100));
  }

  function syncCostAndPrice(nextCostWithoutTax: string, nextTaxRate: string) {
    const cost = Number(nextCostWithoutTax);
    const tax = Number(nextTaxRate);

    if (!nextCostWithoutTax.trim() || !Number.isFinite(cost) || !Number.isFinite(tax)) {
      return;
    }

    const calculated = moneyValue(cost * (1 + tax / 100));
    setCostWithTax(calculated);
    const nextSalePrice = calculateSalePrice(calculated, profitMarginPercent);

    if (nextSalePrice) {
      setSalePrice(nextSalePrice);
    }
  }

  useEffect(() => {
    if (state.ok) {
      router.refresh();

      if ((state.stockQuantity ?? 0) <= 0) {
        return;
      }

      const closeTimeout = window.setTimeout(() => {
        setFormKey((current) => current + 1);
        setCostWithoutTax("");
        setTaxRate("21");
        setCostWithTax("");
        setProfitMarginPercent("0");
        setSalePrice("");
        setOpen(false);
      }, 350);

      return () => window.clearTimeout(closeTimeout);
    }
  }, [router, state.ok, state.stockQuantity]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (!canCreate) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 gap-2 bg-emerald-600 px-4 text-base text-white hover:bg-emerald-700 xl:h-14 xl:px-6 xl:text-lg"
      >
        <PackagePlus className="size-5" aria-hidden="true" />
        {triggerLabel}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3 sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-4">
              <div className="min-w-0 pr-2">
                <p className="truncate text-lg font-bold">Nuevo producto</p>
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
                className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4">
              <form key={formKey} action={formAction} className="grid gap-4">
                <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                  <h3 className="text-base font-bold">Datos principales</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextField
                      label="Nombre"
                      name="name"
                      defaultValue={initialName}
                      required
                    />
                    <TextField
                      label="SKU / codigo interno"
                      name="sku"
                      defaultValue={initialSku}
                      required
                    />
                    <TextField
                      label="Codigo de barras"
                      name="barcode"
                      defaultValue={initialBarcode}
                    />
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
                    <CatalogSelectWithCreate
                      label="Marca"
                      name="brandId"
                      kind="brand"
                      options={brands}
                      placeholder="Sin marca"
                    />
                    <CatalogSelectWithCreate
                      label="Proveedor"
                      name="supplierId"
                      kind="supplier"
                      options={suppliers}
                      placeholder="Sin proveedor"
                    />
                  </div>
                </section>

                <section className="grid gap-3 rounded-lg border border-border bg-background p-4">
                  <h3 className="text-base font-bold">Precio</h3>
                  <div className="grid gap-3 md:grid-cols-5">
                    <NumberField
                      label="Costo sin IVA"
                      name="costWithoutTax"
                      value={costWithoutTax}
                      onChange={(value) => {
                        setCostWithoutTax(value);
                        syncCostAndPrice(value, taxRate);
                      }}
                      step="0.01"
                    />
                    <NumberField
                      label="IVA %"
                      name="taxRate"
                      value={taxRate}
                      onChange={(value) => {
                        setTaxRate(value);
                        syncCostAndPrice(costWithoutTax, value);
                      }}
                      step="0.01"
                    />
                    <NumberField
                      label="Costo con IVA"
                      name="costWithTax"
                      value={costWithTax}
                      onChange={(value) => {
                        setCostWithTax(value);
                        const nextSalePrice = calculateSalePrice(
                          value,
                          profitMarginPercent
                        );

                        if (nextSalePrice) {
                          setSalePrice(nextSalePrice);
                        }
                      }}
                      placeholder={
                        calculatedCostWithTax === null
                          ? ""
                          : moneyValue(calculatedCostWithTax)
                      }
                      step="0.01"
                    />
                    <NumberField
                      label="Utilidad %"
                      name="profitMarginPercent"
                      value={profitMarginPercent}
                      onChange={(value) => {
                        setProfitMarginPercent(value);
                        const nextSalePrice = calculateSalePrice(costWithTax, value);

                        if (nextSalePrice) {
                          setSalePrice(nextSalePrice);
                        }
                      }}
                      step="0.01"
                    />
                    <NumberField
                      label="Precio de venta"
                      name="salePrice"
                      value={salePrice}
                      onChange={setSalePrice}
                      placeholder={
                        calculateSalePrice(costWithTax, profitMarginPercent)
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

                <SaleUnitsEditor fallbackPrice={Number(salePrice) || 0} />

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
                    <div className="flex flex-col gap-2">
                      <p
                        className={`text-base font-semibold ${
                          state.ok ? "text-emerald-700" : "text-destructive"
                        }`}
                      >
                        {state.message}
                      </p>
                      {state.ok && (state.stockQuantity ?? 0) <= 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const searchCode =
                              state.barcode || state.sku || initialBarcode || initialSku;

                            if (searchCode) {
                              setOpen(false);
                              router.push(
                                `/stock?q=${encodeURIComponent(searchCode)}&filtro=todos`
                              );
                            }
                          }}
                          className="h-10 w-fit px-3 text-sm"
                        >
                          Cargar stock ahora
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </form>
            </div>
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

