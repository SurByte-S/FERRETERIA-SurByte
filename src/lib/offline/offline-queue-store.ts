"use client";

const DB_NAME = "ferreteria-offline-queue";
const DB_VERSION = 1;
const QUEUE_STORE = "pending_operations";
const DEFAULT_LIST_LIMIT = 100;

export type OfflineQueueItemType =
  | "quote_create"
  | "quote_update"
  | "sale_create";

export type OfflineQueueItemStatus =
  | "pending"
  | "syncing"
  | "failed"
  | "synced"
  | "discarded";

export type OfflineQueueItem = {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  type: OfflineQueueItemType;
  status: OfflineQueueItemStatus;
  payload: unknown;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  attempt_count: number;
};

type AddOfflineQueueItemInput = {
  tenant_id: string;
  user_id?: string | null;
  type: OfflineQueueItemType;
  payload: unknown;
  status?: OfflineQueueItemStatus;
  attempt_count?: number;
};

type ListOfflineQueueItemsOptions = {
  limit?: number;
  status?: OfflineQueueItemStatus;
};

type UpdateOfflineQueueItemExtra = {
  attempt_count?: number;
  last_error?: string | null;
};

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("El navegador no permite guardar operaciones offline.");
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openOfflineQueueDb() {
  assertIndexedDbAvailable();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const queueStore = db.createObjectStore(QUEUE_STORE, {
          keyPath: "id",
        });

        queueStore.createIndex("tenant_id", "tenant_id", { unique: false });
        queueStore.createIndex("status", "status", { unique: false });
        queueStore.createIndex("type", "type", { unique: false });
        queueStore.createIndex("created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function safeLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 500);
}

export async function addOfflineQueueItem(input: AddOfflineQueueItemInput) {
  const db = await openOfflineQueueDb();
  const now = new Date().toISOString();
  const item: OfflineQueueItem = {
    id: crypto.randomUUID(),
    tenant_id: input.tenant_id,
    user_id: input.user_id ?? null,
    type: input.type,
    status: input.status ?? "pending",
    payload: input.payload,
    created_at: now,
    updated_at: now,
    last_error: null,
    attempt_count: input.attempt_count ?? 0,
  };

  try {
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    transaction.objectStore(QUEUE_STORE).put(item);
    await transactionDone(transaction);

    return item;
  } finally {
    db.close();
  }
}

export async function listOfflineQueueItems(
  tenantId: string,
  options: ListOfflineQueueItemsOptions = {}
) {
  const db = await openOfflineQueueDb();
  const limit = safeLimit(options.limit);

  try {
    const transaction = db.transaction(QUEUE_STORE, "readonly");
    const tenantIndex = transaction.objectStore(QUEUE_STORE).index("tenant_id");
    const items = await requestToPromise(
      tenantIndex.getAll(tenantId)
    ) as OfflineQueueItem[];
    await transactionDone(transaction);

    return items
      .filter((item) => !options.status || item.status === options.status)
      .sort((first, second) => second.created_at.localeCompare(first.created_at))
      .slice(0, limit);
  } finally {
    db.close();
  }
}

export async function updateOfflineQueueItemStatus(
  id: string,
  tenantId: string,
  status: OfflineQueueItemStatus,
  extra: UpdateOfflineQueueItemExtra = {}
) {
  const db = await openOfflineQueueDb();

  try {
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const current = (await requestToPromise(store.get(id))) as
      | OfflineQueueItem
      | undefined;

    if (!current || current.tenant_id !== tenantId) {
      throw new Error("No se encontro la operacion offline para este negocio.");
    }

    const nextItem: OfflineQueueItem = {
      ...current,
      status,
      updated_at: new Date().toISOString(),
      last_error:
        Object.prototype.hasOwnProperty.call(extra, "last_error")
          ? extra.last_error ?? null
          : current.last_error,
      attempt_count:
        typeof extra.attempt_count === "number"
          ? extra.attempt_count
          : current.attempt_count,
    };

    store.put(nextItem);
    await transactionDone(transaction);

    return nextItem;
  } finally {
    db.close();
  }
}

export async function deleteOfflineQueueItem(id: string, tenantId: string) {
  const db = await openOfflineQueueDb();

  try {
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    const current = (await requestToPromise(store.get(id))) as
      | OfflineQueueItem
      | undefined;

    if (!current || current.tenant_id !== tenantId) {
      throw new Error("No se encontro la operacion offline para este negocio.");
    }

    store.delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function countPendingOfflineQueueItems(tenantId: string) {
  const items = await listOfflineQueueItems(tenantId, { limit: 500 });
  const countedStatuses = new Set<OfflineQueueItemStatus>([
    "pending",
    "syncing",
    "failed",
  ]);

  return items.filter((item) => countedStatuses.has(item.status)).length;
}
