"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import {
  createBrandAction,
  createSupplierAction,
  type CatalogCreateState,
} from "@/app/(dashboard)/productos/actions";
import { Button } from "@/components/ui/button";

type CatalogOption = {
  id: string;
  name: string;
};

const initialState: CatalogCreateState = {
  ok: false,
  message: "",
};

type CatalogKind = "brand" | "supplier";

const config = {
  brand: {
    title: "Nueva marca",
    buttonLabel: "+ Nueva",
    nameLabel: "Nombre de marca",
    action: createBrandAction,
  },
  supplier: {
    title: "Nuevo proveedor",
    buttonLabel: "+ Nuevo",
    nameLabel: "Nombre proveedor",
    action: createSupplierAction,
  },
} satisfies Record<
  CatalogKind,
  {
    title: string;
    buttonLabel: string;
    nameLabel: string;
    action: (
      previousState: CatalogCreateState,
      formData: FormData
    ) => Promise<CatalogCreateState>;
  }
>;

export function CatalogSelectWithCreate({
  currentId = "",
  currentName = "",
  kind,
  label,
  name,
  options,
  placeholder,
}: {
  currentId?: string;
  currentName?: string;
  kind: CatalogKind;
  label: string;
  name: string;
  options: CatalogOption[];
  placeholder: string;
}) {
  const settings = config[kind];
  const [createdItems, setCreatedItems] = useState<CatalogOption[]>([]);
  const [selectedId, setSelectedId] = useState(currentId);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const items = [...options, ...createdItems]
    .filter(
      (option, index, allOptions) =>
        allOptions.findIndex((current) => current.id === option.id) === index
    )
    .sort((first, second) => first.name.localeCompare(second.name));
  const hasCurrentOption =
    selectedId && !items.some((option) => option.id === selectedId);

  async function submitCreate() {
    const formData = new FormData();
    formData.set("name", newName);

    if (kind === "supplier") {
      formData.set("phone", supplierPhone);
      formData.set("email", supplierEmail);
      formData.set("address", supplierAddress);
      formData.set("notes", supplierNotes);
    }

    setPending(true);

    try {
      const result = await settings.action(initialState, formData);
      setState(result);

      if (result.ok && result.id && result.name) {
        const createdOption = { id: result.id, name: result.name };
        setCreatedItems((current) =>
          current.some((option) => option.id === createdOption.id)
            ? current
            : [...current, createdOption]
        );
        setSelectedId(createdOption.id);
        setOpen(false);
        setNewName("");
        setSupplierPhone("");
        setSupplierEmail("");
        setSupplierAddress("");
        setSupplierNotes("");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <select
          name={name}
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-base"
        >
          <option value="">{placeholder}</option>
          {hasCurrentOption ? (
            <option value={selectedId}>{currentName || selectedId}</option>
          ) : null}
          {items.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="h-11 gap-2 px-3 text-sm"
        >
          <Plus className="size-4" aria-hidden="true" />
          {settings.buttonLabel}
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${name}-${kind}-create-title`}
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={`${name}-${kind}-create-title`} className="text-lg font-bold">
                {settings.title}
              </h2>
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

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 text-sm font-semibold">
                <span>{settings.nameLabel}</span>
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </label>

              {kind === "supplier" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <OptionalField
                    label="Telefono"
                    value={supplierPhone}
                    onChange={setSupplierPhone}
                  />
                  <OptionalField
                    label="Email"
                    value={supplierEmail}
                    onChange={setSupplierEmail}
                  />
                  <OptionalField
                    label="Direccion"
                    value={supplierAddress}
                    onChange={setSupplierAddress}
                  />
                  <OptionalField
                    label="Notas"
                    value={supplierNotes}
                    onChange={setSupplierNotes}
                  />
                </div>
              ) : null}
            </div>

            {state.message ? (
              <p
                className={`mt-3 text-sm font-semibold ${
                  state.ok ? "text-emerald-700" : "text-destructive"
                }`}
              >
                {state.message}
              </p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="h-11 px-4 text-base"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={submitCreate}
                className="h-11 px-4 text-base"
              >
                {pending ? "Guardando..." : "Crear"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OptionalField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-input bg-background px-3 text-base"
      />
    </label>
  );
}
