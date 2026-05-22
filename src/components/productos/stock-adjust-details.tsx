"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackagePlus, Save, Trash2, X } from "lucide-react";

import {
  deactivateProductAction,
  updateProductStockCommercialAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";
import type { ProductListItem } from "./product-types";
import { SaleUnitsEditor } from "./sale-units-editor";
import { StockAdjustForm } from "./stock-adjust-form";

type CatalogOption = {
  id: string;
  name: string;
};

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

function numberInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

export function StockAdjustDetails({
  brands = [],
  children,
  triggerAriaLabel,
  triggerClassName,
  product,
  canEditPrice,
  suppliers = [],
}: {
  brands?: CatalogOption[];
  children?: ReactNode;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  product: ProductListItem;
  canEditPrice: boolean;
  suppliers?: CatalogOption[];
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <>
      {children ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={triggerClassName}
          aria-label={triggerAriaLabel ?? `Gestionar producto ${product.name}`}
        >
          {children}
        </button>
      ) : (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 w-full gap-2 px-4 text-sm font-bold xl:h-11 xl:text-base"
          aria-label={triggerAriaLabel ?? `Gestionar producto ${product.name}`}
        >
          <PackagePlus className="size-4" aria-hidden="true" />
          Gestionar
        </Button>
      )}
      {message ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">{message}</p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3 sm:p-4">
          <div className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-7xl overflow-x-hidden overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-xl sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold">Gestionar producto</p>
                <p className="truncate text-sm font-semibold text-muted-foreground">
                  {product.name} - {product.sku}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-3 grid gap-4 rounded-lg border border-border bg-muted/20 p-3">
              <section className="min-w-0">
                <StockAdjustForm
                  product={product}
                  onAdjusted={() => setOpen(false)}
                />
              </section>

              {canEditPrice ? (
                <ProductCommercialForm
                  brands={brands}
                  product={product}
                  suppliers={suppliers}
                />
              ) : null}

              {canEditPrice ? (
                <section className="min-w-0">
                  <DangerZone
                    product={product}
                    onDeleted={(nextMessage) => {
                      setOpen(false);
                      setMessage(nextMessage);
                    }}
                  />
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DangerZone({
  onDeleted,
  product,
}: {
  onDeleted: (message: string) => void;
  product: ProductListItem;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    deactivateProductAction,
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const closeTimeout = window.setTimeout(() => {
        setConfirmOpen(false);
        setConfirmation("");
        onDeleted(state.message);
      }, 250);

      return () => window.clearTimeout(closeTimeout);
    }
  }, [onDeleted, router, state.message, state.ok]);

  return (
    <section className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="grid gap-1">
          <h3 className="text-base font-bold text-destructive">Zona peligrosa</h3>
          <p className="text-sm font-semibold text-muted-foreground">
            Eliminar oculta el producto de stock, ventas y busquedas. El historial se conserva.
          </p>
        </div>
      </div>
      <div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          className="h-10 gap-2 px-4 text-sm font-bold"
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Eliminar producto
        </Button>
      </div>

      {state.message && !state.ok ? (
        <p className="text-sm font-semibold text-destructive">{state.message}</p>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">Confirmar eliminacion</p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Esta accion solo oculta el producto. El historial se conserva.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmation("");
                }}
                aria-label="Cerrar confirmacion"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold">
              <p>Producto: {product.name}</p>
              <p>SKU/codigo: {product.sku}</p>
              <p>Stock actual: {product.stockQuantity}</p>
            </div>

            {product.stockQuantity > 0 ? (
              <p className="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
                Este producto todavia tiene stock cargado. Si lo eliminas,
                quedara oculto pero el historial se conservara.
              </p>
            ) : null}

            <form action={formAction} className="mt-4 grid gap-3">
              <input type="hidden" name="productId" value={product.id} />
              <label className="grid gap-2 text-sm font-semibold">
                <span>Escribi ELIMINAR para confirmar</span>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={pending || confirmation !== "ELIMINAR"}
                  className="h-11 gap-2 px-4 text-base"
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                  {pending ? "Eliminando..." : "Eliminar producto"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmation("");
                  }}
                  className="h-11 px-4 text-base"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProductCommercialForm({
  brands,
  product,
  suppliers,
}: {
  brands: CatalogOption[];
  product: ProductListItem;
  suppliers: CatalogOption[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateProductStockCommercialAction,
    initialState
  );
  const [costWithoutTax, setCostWithoutTax] = useState(
    numberInputValue(product.costWithoutTax)
  );
  const [taxRate, setTaxRate] = useState(String(product.taxRate));
  const [costWithTax, setCostWithTax] = useState(
    numberInputValue(product.costWithTax)
  );
  const [salePrice, setSalePrice] = useState(numberInputValue(product.salePrice));
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
    }
  }, [router, state.ok]);

  return (
    <form
      action={formAction}
      className="contents"
    >
      <input type="hidden" name="productId" value={product.id} />

      <section className="grid min-w-0 content-start gap-3 rounded-lg border border-border bg-background p-3">
        <h3 className="text-base font-bold">Precio</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            label="Costo con IVA"
            name="costWithTax"
            value={costWithTax}
            onChange={setCostWithTax}
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
            label="Precio de venta"
            name="salePrice"
            value={salePrice}
            onChange={setSalePrice}
            step="0.01"
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3">
        <h3 className="text-base font-bold">Datos comerciales</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Stock minimo"
            name="minStock"
            defaultValue={String(product.minStock)}
            step="1"
          />
          <SelectField
            currentId={product.brandId}
            currentName={product.brand}
            label="Marca"
            name="brandId"
            options={brands}
            placeholder="Sin marca"
          />
          <SelectField
            currentId={product.supplierId}
            currentName={product.supplier}
            label="Proveedor"
            name="supplierId"
            options={suppliers}
            placeholder="Sin proveedor"
          />
        </div>
      </section>

      <div className="min-w-0">
        <SaleUnitsEditor
          fallbackPrice={product.salePrice}
          saleUnits={product.saleUnits}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending} className="h-11 gap-2 px-4 text-base">
          <Save className="size-5" aria-hidden="true" />
          {pending ? "Guardando..." : "Guardar cambios"}
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
  );
}

function NumberField({
  defaultValue,
  label,
  name,
  onChange,
  step,
  value,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  onChange?: (value: string) => void;
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
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="h-11 rounded-lg border border-input bg-background px-3 text-base"
      />
    </label>
  );
}

function SelectField({
  currentId,
  currentName,
  label,
  name,
  options,
  placeholder,
}: {
  currentId: string;
  currentName: string;
  label: string;
  name: string;
  options: CatalogOption[];
  placeholder: string;
}) {
  const hasCurrentOption =
    currentId && !options.some((option) => option.id === currentId);

  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={currentId}
        className="h-11 rounded-lg border border-input bg-background px-3 text-base"
      >
        <option value="">{placeholder}</option>
        {hasCurrentOption ? (
          <option value={currentId}>{currentName || currentId}</option>
        ) : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
