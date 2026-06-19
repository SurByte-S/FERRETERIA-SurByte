"use client";

import {
  forwardRef,
  startTransition,
  useActionState,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackagePlus, Save, Trash2, X } from "lucide-react";

import {
  adjustProductStockAction,
  deactivateProductAction,
  updateProductStockCommercialAction,
  type ProductActionState,
} from "@/app/(dashboard)/productos/actions";
import {
  removeProductPrimaryBarcodeAction,
  updateProductPrimaryBarcodeAction,
  type BarcodeMutationResult,
} from "@/app/(dashboard)/stock/actions";
import { DeleteConfirmDialog } from "@/components/common/delete-confirm-dialog";
import { CatalogSelectWithCreate } from "@/components/productos/catalog-select-with-create";
import { Button } from "@/components/ui/button";
import { normalizeProductCode } from "@/lib/product-code";
import type { ProductListItem } from "./product-types";
import { SaleUnitsEditor } from "./sale-units-editor";
import {
  StockAdjustForm,
  type StockAdjustFormHandle,
} from "./stock-adjust-form";

type CatalogOption = {
  id: string;
  name: string;
};

const initialState: ProductActionState = {
  ok: false,
  message: "",
};

type CommercialFormHandle = {
  getFormData: () => FormData | null;
  hasChanges: () => boolean;
  markSaved: () => void;
};

type PrimaryBarcodeHandle = {
  getBarcode: () => string;
  hasChanges: () => boolean;
  markSaved: (result: BarcodeMutationResult) => void;
  needsReplacementConfirmation: () => boolean;
};

function numberInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function numberValue(value: string) {
  return Number(value.replace(",", "."));
}

function moneyValue(value: number) {
  return value.toFixed(2);
}

function formDataSignature(form: HTMLFormElement) {
  return JSON.stringify(
    [...new FormData(form).entries()].map(([key, value]) => [
      key,
      typeof value === "string" ? value : value.name,
    ])
  );
}

export function StockAdjustDetails({
  brands = [],
  children,
  defaultOpen = false,
  onAdjusted,
  triggerAriaLabel,
  triggerClassName,
  product,
  canEditPrice,
  suppliers = [],
}: {
  brands?: CatalogOption[];
  children?: ReactNode;
  defaultOpen?: boolean;
  onAdjusted?: () => void;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  product: ProductListItem;
  canEditPrice: boolean;
  suppliers?: CatalogOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState(initialState);
  const savingRef = useRef(false);
  const commercialFormRef = useRef<CommercialFormHandle>(null);
  const primaryBarcodeRef = useRef<PrimaryBarcodeHandle>(null);
  const stockFormRef = useRef<StockAdjustFormHandle>(null);

  async function saveChanges() {
    if (savingRef.current) {
      return;
    }

    const commercialChanged = Boolean(
      canEditPrice && commercialFormRef.current?.hasChanges()
    );
    const barcodeChanged = Boolean(primaryBarcodeRef.current?.hasChanges());
    const stockChanged = Boolean(stockFormRef.current?.hasChanges());

    if (!commercialChanged && !barcodeChanged && !stockChanged) {
      setSaveState({ ok: true, message: "No hay cambios para guardar." });
      return;
    }

    if (
      stockChanged &&
      !window.confirm(
        "Vas a modificar el stock y se registrará un movimiento de inventario. ¿Continuar?"
      )
    ) {
      return;
    }

    const replaceBarcode = Boolean(
      barcodeChanged &&
        primaryBarcodeRef.current?.needsReplacementConfirmation()
    );

    if (
      replaceBarcode &&
      !window.confirm(
        "Este producto ya tiene otro código de barras. ¿Querés reemplazarlo?"
      )
    ) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveState(initialState);
    const savedSections: string[] = [];

    try {
      if (commercialChanged) {
        const formData = commercialFormRef.current?.getFormData();

        if (!formData) {
          throw new Error("No se pudo leer la sección de datos comerciales.");
        }

        const result = await updateProductStockCommercialAction(
          initialState,
          formData
        );

        if (!result.ok) {
          throw new Error(`Datos comerciales: ${result.message}`);
        }

        commercialFormRef.current?.markSaved();
        savedSections.push("datos comerciales");
      }

      if (barcodeChanged) {
        const result = await updateProductPrimaryBarcodeAction({
          barcode: primaryBarcodeRef.current?.getBarcode() ?? "",
          confirmReplace: replaceBarcode,
          productId: product.id,
        });

        if (!result.ok) {
          throw new Error(`Código de barras: ${result.message}`);
        }

        primaryBarcodeRef.current?.markSaved(result);
        savedSections.push("código de barras");
      }

      if (stockChanged) {
        const formData = stockFormRef.current?.getFormData();

        if (!formData) {
          throw new Error("No se pudo leer la sección de stock.");
        }

        const result = await adjustProductStockAction(initialState, formData);

        if (!result.ok) {
          throw new Error(`Stock: ${result.message}`);
        }

        stockFormRef.current?.markSaved();
        savedSections.push("stock");
        onAdjusted?.();
      }

      setSaveState({
        ok: true,
        message: "Cambios guardados correctamente.",
      });
      router.refresh();
    } catch (error) {
      const partialMessage =
        savedSections.length > 0
          ? ` Se guardó: ${savedSections.join(", ")}.`
          : "";
      setSaveState({
        ok: false,
        message: `${
          error instanceof Error ? error.message : "No se pudieron guardar los cambios."
        }${partialMessage}`,
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

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
          <PackagePlus className="size-5" aria-hidden="true" />
          Gestionar
        </Button>
      )}
      {message ? (
        <p className="mt-2 text-sm font-semibold text-emerald-700">{message}</p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/35 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-7xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-4">
              <div className="min-w-0 pr-2">
                <p className="text-xl font-bold">Gestionar producto</p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-muted-foreground">
                  <p className="min-w-0 max-w-full truncate">{product.name}</p>
                  <p className="shrink-0 truncate">Codigo interno: {product.sku}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500"
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="min-h-0 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
              <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-3">
                <section className="min-w-0">
                  <StockAdjustForm
                    ref={stockFormRef}
                    product={product}
                  />
                </section>

                {canEditPrice ? (
                  <ProductCommercialForm
                    ref={commercialFormRef}
                    brands={brands}
                    product={product}
                    primaryBarcodeRef={primaryBarcodeRef}
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

            <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-4">
              <Button
                type="button"
                onClick={saveChanges}
                disabled={saving}
                className="h-11 w-full gap-2 px-4 text-base sm:w-auto"
              >
                <Save className="size-5" aria-hidden="true" />
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
              {saveState.message ? (
                <p
                  aria-live="polite"
                  className={`text-sm font-semibold sm:text-base ${
                    saveState.ok
                      ? "text-emerald-700"
                      : "text-destructive"
                  }`}
                >
                  {saveState.message}
                </p>
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
  const [state, formAction, pending] = useActionState(
    deactivateProductAction,
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      const closeTimeout = window.setTimeout(() => {
        setConfirmOpen(false);
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
          className="h-10 gap-2 bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 focus-visible:ring-red-500"
        >
          <Trash2 className="size-5" aria-hidden="true" />
          Eliminar producto
        </Button>
      </div>

      {state.message && !state.ok ? (
        <p className="text-sm font-semibold text-destructive">{state.message}</p>
      ) : null}

      {confirmOpen ? (
        <DeleteConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Eliminar producto"
          description="Vas a eliminar este producto del stock. Ya no aparecera en ventas ni busquedas, pero el historial se conservara."
          confirmLabel="Eliminar producto"
          isPending={pending}
          onConfirm={() => {
            const formData = new FormData();
            formData.set("productId", product.id);
            startTransition(() => formAction(formData));
          }}
        >
          <>
            <div className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold">
              <p>Producto: {product.name}</p>
              <p>Codigo interno: {product.sku}</p>
              <p>Stock actual: {product.stockQuantity}</p>
            </div>

            {product.stockQuantity > 0 ? (
              <p className="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
                Este producto todavia tiene stock cargado. Si lo eliminas,
                quedara oculto pero el historial se conservara.
              </p>
            ) : null}
          </>
        </DeleteConfirmDialog>
      ) : null}
    </section>
  );
}

const ProductCommercialForm = forwardRef<
  CommercialFormHandle,
  {
    brands: CatalogOption[];
    primaryBarcodeRef: React.RefObject<PrimaryBarcodeHandle | null>;
    product: ProductListItem;
    suppliers: CatalogOption[];
  }
>(function ProductCommercialForm(
  { brands, primaryBarcodeRef, product, suppliers },
  ref
) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialFormSignatureRef = useRef("");
  const [costWithoutTax, setCostWithoutTax] = useState(
    numberInputValue(product.costWithoutTax)
  );
  const [taxRate, setTaxRate] = useState(String(product.taxRate));
  const [costWithTax, setCostWithTax] = useState(
    numberInputValue(product.costWithTax)
  );
  const [profitMarginPercent, setProfitMarginPercent] = useState(
    String(product.profitMarginPercent)
  );
  const [salePrice, setSalePrice] = useState(numberInputValue(product.salePrice));
  function calculateSalePrice(nextCostWithTax: string, nextProfitMargin: string) {
    const cost = numberValue(nextCostWithTax);
    const margin = numberValue(nextProfitMargin);

    if (!nextCostWithTax.trim() || !Number.isFinite(cost) || !Number.isFinite(margin)) {
      return "";
    }

    return moneyValue(cost * (1 + margin / 100));
  }

  function syncCostAndPrice(nextCostWithoutTax: string, nextTaxRate: string) {
    const cost = numberValue(nextCostWithoutTax);
    const tax = numberValue(nextTaxRate);

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
    if (formRef.current) {
      initialFormSignatureRef.current = formDataSignature(formRef.current);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    getFormData: () =>
      formRef.current ? new FormData(formRef.current) : null,
    hasChanges: () =>
      Boolean(
        formRef.current &&
          formDataSignature(formRef.current) !== initialFormSignatureRef.current
      ),
    markSaved: () => {
      if (formRef.current) {
        initialFormSignatureRef.current = formDataSignature(formRef.current);
      }
    },
  }), []);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => event.preventDefault()}
      className="contents"
    >
      <input type="hidden" name="productId" value={product.id} />

      <section className="grid min-w-0 content-start gap-3 rounded-lg border border-border bg-background p-3">
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
              const nextSalePrice = calculateSalePrice(value, profitMarginPercent);

              if (nextSalePrice) {
                setSalePrice(nextSalePrice);
              }
            }}
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
          <CatalogSelectWithCreate
            currentId={product.brandId}
            currentName={product.brand}
            label="Marca"
            name="brandId"
            kind="brand"
            options={brands}
            placeholder="Sin marca"
          />
          <CatalogSelectWithCreate
            currentId={product.supplierId}
            currentName={product.supplier}
            label="Proveedor"
            name="supplierId"
            kind="supplier"
            options={suppliers}
            placeholder="Sin proveedor"
          />
        </div>
      </section>

      <PrimaryBarcodeSection
        ref={primaryBarcodeRef}
        key={`${product.id}:${product.productBarcode}:${product.hasProductBarcode}`}
        product={product}
      />

      <div className="min-w-0">
        <SaleUnitsEditor
          fallbackPrice={product.salePrice}
          saleUnits={product.saleUnits}
        />
      </div>

    </form>
  );
});

const PrimaryBarcodeSection = forwardRef<
  PrimaryBarcodeHandle,
  { product: ProductListItem }
>(function PrimaryBarcodeSection({ product }, ref) {
  const router = useRouter();
  const initialBarcode = product.hasProductBarcode ? product.productBarcode : "";
  const [barcode, setBarcode] = useState(initialBarcode);
  const [savedBarcode, setSavedBarcode] = useState(initialBarcode);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const normalizedInput = normalizeProductCode(barcode);
  const normalizedSavedBarcode = normalizeProductCode(savedBarcode);
  const statusLabel = normalizedSavedBarcode
    ? `Codigo de barras: ${savedBarcode}`
    : product.productBarcode
      ? "Codigo interno heredado"
      : "Sin codigo de barras cargado";

  useImperativeHandle(ref, () => ({
    getBarcode: () => normalizedInput,
    hasChanges: () => normalizedInput !== normalizedSavedBarcode,
    markSaved: (result) => {
      const nextBarcode = result.product?.hasProductBarcode
        ? result.product.productBarcode
        : normalizedInput;
      setBarcode(nextBarcode);
      setSavedBarcode(nextBarcode);
      setMessage("");
    },
    needsReplacementConfirmation: () =>
      Boolean(
        normalizedSavedBarcode && normalizedInput !== normalizedSavedBarcode
      ),
  }), [normalizedInput, normalizedSavedBarcode]);

  function removeBarcode() {
    setPending(true);
    startTransition(async () => {
      const result = await removeProductPrimaryBarcodeAction({
        productId: product.id,
      });

      setMessage(result.message);

      if (result.ok) {
        setBarcode("");
        setSavedBarcode("");
        router.refresh();
      }

      setPending(false);
    });
  }

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3">
      <div>
        <h3 className="text-base font-bold">Codigo de barras principal</h3>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Este es el codigo que escaneas para encontrar el producto.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-2 text-base font-semibold">
          <span>Codigo interno</span>
          <input
            readOnly
            value={product.sku}
            className="h-11 rounded-lg border border-input bg-muted/40 px-3 font-mono text-base"
          />
        </label>
        <label className="grid gap-2 text-base font-semibold">
          <span>Codigo de barras</span>
          <input
            value={barcode}
            onChange={(event) => {
              event.stopPropagation();
              setBarcode(event.target.value);
            }}
            placeholder="Escribir o escanear codigo"
            className="h-11 rounded-lg border border-input bg-background px-3 font-mono text-base"
          />
        </label>
      </div>

      <p className="font-mono text-sm font-semibold text-muted-foreground">
        {statusLabel}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {normalizedSavedBarcode ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={removeBarcode}
            className="h-11 gap-2 px-4 text-base text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="size-5" aria-hidden="true" />
            Quitar codigo
          </Button>
        ) : null}
        {message ? (
          <p
            className={`text-base font-semibold ${
              message.includes("eliminado")
                ? "text-emerald-700"
                : "text-destructive"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
});

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
    <label className="grid gap-2 text-base font-semibold">
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

