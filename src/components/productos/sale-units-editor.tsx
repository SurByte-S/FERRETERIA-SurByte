"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductSaleUnit } from "./product-types";

type EditableSaleUnit = ProductSaleUnit & {
  localId: string;
};

function createLocalId() {
  return `local-${Math.random().toString(36).slice(2)}`;
}

function normalizeUnits(units: ProductSaleUnit[], fallbackPrice: number | null) {
  const source =
    units.length > 0
      ? units
      : [
          {
            id: "",
            name: "Unidad",
            quantityInBaseUnit: 1,
            salePrice: fallbackPrice ?? 0,
            barcode: "",
            isDefault: true,
            active: true,
          },
        ];

  return source.map((unit) => ({
    ...unit,
    localId: unit.id || createLocalId(),
  }));
}

export function SaleUnitsEditor({
  fallbackPrice,
  inputName = "saleUnits",
  onUnitsChange,
  saleUnits = [],
}: {
  fallbackPrice: number | null;
  inputName?: string;
  onUnitsChange?: (units: ProductSaleUnit[]) => void;
  saleUnits?: ProductSaleUnit[];
}) {
  const [units, setUnits] = useState<EditableSaleUnit[]>(() =>
    normalizeUnits(saleUnits, fallbackPrice)
  );
  const serialized = useMemo(
    () =>
      JSON.stringify(
        units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          quantityInBaseUnit: unit.quantityInBaseUnit,
          salePrice: unit.salePrice,
          barcode: unit.barcode,
          isDefault: unit.isDefault,
          active: unit.active,
        }))
      ),
    [units]
  );
  const activeUnits = units.filter((unit) => unit.active);
  const publicUnits = useMemo(
    () =>
      units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        quantityInBaseUnit: unit.quantityInBaseUnit,
        salePrice: unit.salePrice,
        barcode: unit.barcode,
        isDefault: unit.isDefault,
        active: unit.active,
      })),
    [units]
  );

  useEffect(() => {
    onUnitsChange?.(publicUnits);
  }, [onUnitsChange, publicUnits]);

  function updateUnit(
    localId: string,
    key: keyof Pick<
      EditableSaleUnit,
      "name" | "quantityInBaseUnit" | "salePrice" | "barcode"
    >,
    value: string
  ) {
    setUnits((current) =>
      current.map((unit) =>
        unit.localId === localId
          ? {
              ...unit,
              [key]:
                key === "quantityInBaseUnit" || key === "salePrice"
                  ? Number(value)
                  : value,
            }
          : unit
      )
    );
  }

  function setDefault(localId: string) {
    setUnits((current) =>
      current.map((unit) => ({
        ...unit,
        isDefault: unit.localId === localId,
        active: unit.localId === localId ? true : unit.active,
      }))
    );
  }

  function addUnit() {
    setUnits((current) => [
      ...current,
      {
        id: "",
        localId: createLocalId(),
        name: "",
        quantityInBaseUnit: 1,
        salePrice: fallbackPrice ?? 0,
        barcode: "",
        isDefault: false,
        active: true,
      },
    ]);
  }

  function removeUnit(localId: string) {
    setUnits((current) => {
      const next = current.map((unit) =>
        unit.localId === localId ? { ...unit, active: false, isDefault: false } : unit
      );
      const hasDefault = next.some((unit) => unit.active && unit.isDefault);

      if (hasDefault) {
        return next;
      }

      return next.map((unit) =>
        unit.active ? { ...unit, isDefault: true } : unit
      );
    });
  }

  return (
    <section className="grid w-full min-w-0 gap-3 overflow-x-hidden rounded-lg border border-border bg-background p-3">
      <input type="hidden" name={inputName} value={serialized} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold">Presentaciones de venta</h3>
        <Button
          type="button"
          variant="outline"
          onClick={addUnit}
          className="h-10 gap-2 px-3 text-base font-bold"
        >
          <Plus className="size-5" aria-hidden="true" />
          Agregar
        </Button>
      </div>

      <div className="grid min-w-0 gap-3">
        {activeUnits.map((unit) => (
          <div
            key={unit.localId}
            className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/30 p-3"
          >
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_120px_140px] md:items-end">
              <Field label="Nombre">
                <input
                  value={unit.name}
                  onChange={(event) =>
                    updateUnit(unit.localId, "name", event.target.value)
                  }
                  placeholder="Nombre de la presentacion"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-base"
                />
              </Field>
              <Field label="Descuenta">
                <input
                  value={unit.quantityInBaseUnit}
                  onChange={(event) =>
                    updateUnit(
                      unit.localId,
                      "quantityInBaseUnit",
                      event.target.value
                    )
                  }
                  type="number"
                  min="0.001"
                  step="0.001"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-base"
                />
              </Field>
              <Field label="Precio">
                <input
                  value={unit.salePrice}
                  onChange={(event) =>
                    updateUnit(unit.localId, "salePrice", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-right text-base"
                />
              </Field>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_40px] md:items-end">
              <Field
                label="Codigo de esta presentacion (opcional)"
                help="Usalo solamente si caja, blister o unidad tienen un codigo propio."
              >
                <input
                  value={unit.barcode}
                  onChange={(event) =>
                    updateUnit(unit.localId, "barcode", event.target.value)
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-base"
                />
              </Field>
              <label className="flex h-10 min-w-0 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-background px-3 text-base font-bold">
                <input
                  type="radio"
                  checked={unit.isDefault}
                  onChange={() => setDefault(unit.localId)}
                  className="size-4"
                />
                Predeterminada
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeUnit(unit.localId)}
                disabled={activeUnits.length <= 1}
                aria-label={`Quitar ${unit.name || "presentacion"}`}
                className="size-10 text-red-600 hover:bg-red-50 hover:text-red-700 md:justify-self-end"
              >
                <Trash2 className="size-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
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
    <label className="grid min-w-0 gap-1.5 text-base font-semibold">
      <span>{label}</span>
      {children}
      {help ? (
        <span className="text-sm font-semibold text-muted-foreground">
          {help}
        </span>
      ) : null}
    </label>
  );
}
