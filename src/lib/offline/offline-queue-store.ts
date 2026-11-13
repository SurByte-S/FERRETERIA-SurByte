"use client";

import { captureOfflineSession } from "./offline-session";

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
  id?: string;
  tenant_id: string;
  user_id: string;
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

const DISCARDABLE_STATUSES = new Set<OfflineQueueItemStatus>([
  "pending",
  "failed",
]);

function assertQueueScope(tenantId: string, userId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    typeof tenantId !== "string" || !uuid.test(tenantId) ||
    typeof userId !== "string" || !uuid.test(userId)
  ) {
    throw new Error("Se requiere un negocio y un usuario validos para acceder a la cola offline.");
  }
  return captureOfflineSession(tenantId, userId);
}

function scopedTransaction(
  db: IDBDatabase, mode: IDBTransactionMode,
  session: ReturnType<typeof captureOfflineSession>
) {
  session.check();
  const transaction = db.transaction(QUEUE_STORE, mode);
  const unsubscribe = session.subscribe(() => {
    try { session.check(); } catch {
      try { transaction.abort(); } catch { /* Already committed; never delete a saved record. */ }
    }
  });
  transaction.addEventListener("complete", unsubscribe, { once: true });
  transaction.addEventListener("abort", unsubscribe, { once: true });
  return transaction;
}

function belongsToScope(item: OfflineQueueItem, tenantId: string, userId: string) {
  // Legacy records without an owner remain stored, but never belong to this scope.
  return item.tenant_id === tenantId && item.user_id === userId;
}

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
    // A request error bubbles before transaction.error is set. Wait for abort
    // so duplicate insertions reject with ConstraintError rather than null.
    transaction.onabort = () => reject(
      transaction.error ?? new Error("No se pudo completar la operacion offline.")
    );
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
  const session = assertQueueScope(input.tenant_id, input.user_id);
  const id = input.id ?? crypto.randomUUID();

  if (typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("El identificador local de la operacion no es valido.");
  }

  const db = await openOfflineQueueDb();
  const now = new Date().toISOString();
  const item: OfflineQueueItem = {
    id: id.toLowerCase(),
    tenant_id: input.tenant_id,
    user_id: input.user_id,
    type: input.type,
    status: input.status ?? "pending",
    payload: input.payload,
    created_at: now,
    updated_at: now,
    last_error: null,
    attempt_count: input.attempt_count ?? 0,
  };

  try {
    const transaction = scopedTransaction(db, "readwrite", session);
    // add rejects duplicate IDs atomically, including concurrent insertions.
    transaction.objectStore(QUEUE_STORE).add(item);
    await transactionDone(transaction);
    session.check();
    return item;
  } finally {
    db.close();
  }
}

export async function listOfflineQueueItems(
  tenantId: string,
  userId: string,
  options: ListOfflineQueueItemsOptions = {}
) {
  const session = assertQueueScope(tenantId, userId);
  const db = await openOfflineQueueDb();
  const limit = safeLimit(options.limit);

  try {
    const transaction = scopedTransaction(db, "readonly", session);
    const tenantIndex = transaction.objectStore(QUEUE_STORE).index("tenant_id");
    const items = await requestToPromise(
      tenantIndex.getAll(tenantId)
    ) as OfflineQueueItem[];
    await transactionDone(transaction);
    session.check();
    return items
      .filter((item) => belongsToScope(item, tenantId, userId))
      .filter((item) => !options.status || item.status === options.status)
      .sort((first, second) => second.created_at.localeCompare(first.created_at))
      .slice(0, limit);
  } finally {
    db.close();
  }
}

const ACTIVE_QUOTE_STATUSES = new Set<OfflineQueueItemStatus>([
  "pending",
  "failed",
  "syncing",
]);

// Scan only this tenant's index. Count all matching records and retain at most
// limit newest items, without loading the entire tenant queue into memory.
async function readOfflineQuoteCreateItems(
  tenantId: string,
  userId: string,
  limit: number
) {
  const session = assertQueueScope(tenantId, userId);
  const db = await openOfflineQueueDb();

  try {
    const transaction = scopedTransaction(db, "readonly", session);
    const index = transaction.objectStore(QUEUE_STORE).index("tenant_id");

    return await new Promise<{ items: OfflineQueueItem[]; total: number; hasMore: boolean }>(
      (resolve, reject) => {
        const items: OfflineQueueItem[] = [];
        let total = 0;
        const request = index.openCursor(IDBKeyRange.only(tenantId));

        transaction.onabort = () => reject(
          transaction.error ?? new Error("No se pudieron leer los presupuestos locales.")
        );
        transaction.oncomplete = () => {
          try {
            session.check();
            resolve({ items, total, hasMore: total > items.length });
          } catch (error) { reject(error); }
        };
        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            return;
          }

          const item = cursor.value as OfflineQueueItem;

          if (belongsToScope(item, tenantId, userId) &&
              item.type === "quote_create" && ACTIVE_QUOTE_STATUSES.has(item.status)) {
            total += 1;

            if (limit > 0) {
              const date = typeof item.created_at === "string" ? item.created_at : "";
              const position = items.findIndex((current) =>
                date > (typeof current.created_at === "string" ? current.created_at : "")
              );
              const insertionIndex = position < 0 ? items.length : position;

              if (insertionIndex < limit) {
                items.splice(insertionIndex, 0, item);

                if (items.length > limit) {
                  items.pop();
                }
              }
            }
          }

          cursor.continue();
        };
      }
    );
  } finally {
    db.close();
  }
}

export async function listOfflineQuoteCreateItems(
  tenantId: string,
  userId: string,
  options: { limit?: number } = {}
) {
  return readOfflineQuoteCreateItems(tenantId, userId, safeLimit(options.limit));
}

export async function countOfflineQuoteCreateItems(tenantId: string, userId: string) {
  const result = await readOfflineQuoteCreateItems(tenantId, userId, 0);
  return result.total;
}

export async function updateOfflineQueueItemStatus(
  id: string,
  tenantId: string,
  userId: string,
  status: OfflineQueueItemStatus,
  extra: UpdateOfflineQueueItemExtra = {}
) {
  const session = assertQueueScope(tenantId, userId);
  const db = await openOfflineQueueDb();

  try {
    const transaction = scopedTransaction(db, "readwrite", session);
    const store = transaction.objectStore(QUEUE_STORE);
    const current = (await requestToPromise(store.get(id))) as
      | OfflineQueueItem
      | undefined;

    if (!current || !belongsToScope(current, tenantId, userId)) {
      throw new Error("No se encontro la operacion offline para este negocio y usuario.");
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

    session.check();
    store.put(nextItem);
    await transactionDone(transaction);
    session.check();
    return nextItem;
  } finally {
    db.close();
  }
}

export async function deleteOfflineQueueItem(id: string, tenantId: string, userId: string) {
  const session = assertQueueScope(tenantId, userId);
  const db = await openOfflineQueueDb();

  try {
    const transaction = scopedTransaction(db, "readwrite", session);
    const store = transaction.objectStore(QUEUE_STORE);
    const current = (await requestToPromise(store.get(id))) as
      | OfflineQueueItem
      | undefined;

    if (!current || !belongsToScope(current, tenantId, userId)) {
      throw new Error("No se encontro la operacion offline para este negocio y usuario.");
    }

    session.check();
    store.delete(id);
    await transactionDone(transaction);
    session.check();
  } finally {
    db.close();
  }
}

export async function discardOfflineQueueItem(id: string, tenantId: string, userId: string) {
  const session = assertQueueScope(tenantId, userId);
  const db = await openOfflineQueueDb();

  try {
    const transaction = scopedTransaction(db, "readwrite", session);
    const store = transaction.objectStore(QUEUE_STORE);
    const current = (await requestToPromise(store.get(id))) as
      | OfflineQueueItem
      | undefined;

    if (!current || !belongsToScope(current, tenantId, userId)) {
      throw new Error("No se encontro la operacion offline para este negocio y usuario.");
    }

    if (!DISCARDABLE_STATUSES.has(current.status)) {
      throw new Error("Esta operacion offline no se puede descartar.");
    }

    const nextItem: OfflineQueueItem = {
      ...current,
      status: "discarded",
      updated_at: new Date().toISOString(),
      last_error: current.last_error,
    };

    session.check();
    store.put(nextItem);
    await transactionDone(transaction);
    session.check();
    return nextItem;
  } finally {
    db.close();
  }
}

async function clearOfflineQueueItemsByStatus(
  tenantId: string,
  userId: string,
  status: OfflineQueueItemStatus
) {
  const session = assertQueueScope(tenantId, userId);
  const db = await openOfflineQueueDb();

  try {
    const transaction = scopedTransaction(db, "readwrite", session);
    const store = transaction.objectStore(QUEUE_STORE);
    const tenantIndex = store.index("tenant_id");
    let deletedCount = 0;

    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("abort", () => reject(new Error("Operacion local cancelada.")), { once: true });
      const request = tenantIndex.openCursor(IDBKeyRange.only(tenantId));

      request.onsuccess = () => {
        try { session.check(); } catch (error) {
          try { transaction.abort(); } catch { /* Already finished. */ }
          reject(error);
          return;
        }
        const cursor = request.result;

        if (!cursor) {
          resolve();
          return;
        }

        const item = cursor.value as OfflineQueueItem;

        if (belongsToScope(item, tenantId, userId) && item.status === status) {
          cursor.delete();
          deletedCount += 1;
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);
    session.check();
    return deletedCount;
  } finally {
    db.close();
  }
}

export async function clearDiscardedOfflineQueueItems(tenantId: string, userId: string) {
  return clearOfflineQueueItemsByStatus(tenantId, userId, "discarded");
}

export async function clearSyncedOfflineQueueItems(tenantId: string, userId: string) {
  return clearOfflineQueueItemsByStatus(tenantId, userId, "synced");
}

export async function countPendingOfflineQueueItems(tenantId: string, userId: string) {
  const items = await listOfflineQueueItems(tenantId, userId, { limit: 500 });
  const countedStatuses = new Set<OfflineQueueItemStatus>([
    "pending",
    "syncing",
    "failed",
  ]);

  return items.filter((item) => countedStatuses.has(item.status)).length;
}
