"use client";

import {
  addOfflineQueueItem,
  type OfflineQueueItem,
} from "./offline-queue-store";

// Snapshot of the POS ticket, not the RPC arguments. The current RPC resolves
// prices on the server; a future sync must explicitly handle any differences.
export type OfflineQuoteCreatePayload = {
  customer: {
    id: string | null;
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  lines: {
    id: string;
    sku: string;
    displayCode: string;
    name: string;
    description: string;
    unit: string;
    quantity: number;
    price: number;
    selectedSaleUnitId: string | null;
    selectedSaleUnitName: string;
    quantityInBaseUnit: number;
  }[];
  total: number;
  notes: "Presupuesto creado desde mostrador";
};

export type OfflineQuoteCreateItem = Omit<
  OfflineQueueItem,
  "user_id" | "type" | "status" | "payload"
> & {
  user_id: string;
  type: "quote_create";
  status: "pending";
  payload: OfflineQuoteCreatePayload;
};

type AddOfflineQuoteCreateItemInput = {
  // Generate once per logical save and reuse on retries. Never regenerate here.
  id: string;
  tenant_id: string;
  user_id: string;
  payload: OfflineQuoteCreatePayload;
};

function invalidPayload(): never {
  throw new Error("Los datos del presupuesto pendiente no son validos.");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidPayload();
  }

  return value as Record<string, unknown>;
}

function text(value: unknown) {
  if (typeof value !== "string") {
    return invalidPayload();
  }

  return value;
}

function uuid(value: unknown) {
  const result = text(value);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) {
    return invalidPayload();
  }

  return result;
}

function nullableUuid(value: unknown) {
  // The POS uses an empty string when no customer or sale unit is selected.
  return value === null || value === "" ? null : uuid(value);
}

function number(value: unknown, positive = false) {
  if (
    typeof value !== "number" || !Number.isFinite(value) ||
    (positive ? value <= 0 : value < 0)
  ) {
    return invalidPayload();
  }

  return value;
}

// Validate at runtime and return a detached snapshot with only known fields.
// Do not round/reprice here: total preserves the POS calculation at save time.
export function validateOfflineQuoteCreatePayload(value: unknown): OfflineQuoteCreatePayload {
  const payload = record(value);
  const customer = record(payload.customer);

  if (
    !Array.isArray(payload.lines) || payload.lines.length === 0 ||
    payload.notes !== "Presupuesto creado desde mostrador"
  ) {
    return invalidPayload();
  }

  const lines = Array.from(payload.lines, (value) => {
    const line = record(value);

    return {
      id: uuid(line.id),
      sku: text(line.sku),
      displayCode: text(line.displayCode),
      name: text(line.name),
      description: text(line.description),
      unit: text(line.unit),
      quantity: number(line.quantity, true),
      price: number(line.price),
      selectedSaleUnitId: nullableUuid(line.selectedSaleUnitId),
      selectedSaleUnitName: text(line.selectedSaleUnitName),
      quantityInBaseUnit: number(line.quantityInBaseUnit, true),
    };
  });
  const total = number(payload.total);
  const calculatedTotal = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);

  if (!Number.isFinite(calculatedTotal) || Math.abs(total - calculatedTotal) > 0.000001) {
    return invalidPayload();
  }

  return {
    customer: {
      id: nullableUuid(customer.id),
      name: text(customer.name).trim(),
      phone: text(customer.phone).trim(),
      email: text(customer.email).trim(),
      address: text(customer.address).trim(),
    },
    lines,
    total,
    notes: payload.notes,
  };
}

export async function addOfflineQuoteCreateItem(
  input: AddOfflineQuoteCreateItemInput
): Promise<OfflineQuoteCreateItem> {
  const id = uuid(input.id);
  const tenantId = uuid(input.tenant_id);
  const userId = uuid(input.user_id);
  // Validate/copy before awaiting IndexedDB so later ticket edits cannot alter it.
  const payload = validateOfflineQuoteCreatePayload(input.payload);
  const item = await addOfflineQueueItem({
    id,
    tenant_id: tenantId,
    user_id: userId,
    type: "quote_create",
    payload,
    status: "pending",
    attempt_count: 0,
  });

  return { ...item, user_id: userId, type: "quote_create", status: "pending", payload };
}
