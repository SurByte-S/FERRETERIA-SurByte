"use client";

const DB_NAME = "ferreteria-offline";
const DB_VERSION = 1;
const PRODUCTS_STORE = "offline_products";
const META_STORE = "offline_meta";

export type OfflineCatalogProduct = {
  id: string;
  tenant_id: string;
  sku: string | null;
  custom_code: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  active: boolean;
  updated_at: string | null;
  category: string | null;
  brand: string | null;
  supplier: string | null;
};

export type OfflineCatalogMeta = {
  tenant_id: string;
  tenant_name: string;
  product_count: number;
  generated_at: string | null;
  saved_at: string;
};

type SaveOfflineCatalogInput = {
  tenant: {
    id: string;
    name: string;
  };
  products: OfflineCatalogProduct[];
  generatedAt?: string | null;
};

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function productMatchesQuery(product: OfflineCatalogProduct, query: string) {
  if (!query) {
    return true;
  }

  return [
    product.name,
    product.sku,
    product.custom_code,
    product.barcode,
    product.brand,
    product.category,
  ].some((value) => normalizeSearchValue(value).includes(query));
}

function productMatchesCode(product: OfflineCatalogProduct, code: string) {
  return [product.custom_code, product.sku, product.barcode].some(
    (value) => normalizeSearchValue(value) === code
  );
}

function assertIndexedDbAvailable() {
  if (typeof indexedDB === "undefined") {
    throw new Error("El navegador no permite guardar el catalogo offline.");
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

function openOfflineCatalogDb() {
  assertIndexedDbAvailable();

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
        const productsStore = db.createObjectStore(PRODUCTS_STORE, {
          keyPath: "id",
        });

        productsStore.createIndex("tenant_id", "tenant_id", { unique: false });
        productsStore.createIndex("name", "name", { unique: false });
        productsStore.createIndex("sku", "sku", { unique: false });
        productsStore.createIndex("custom_code", "custom_code", {
          unique: false,
        });
        productsStore.createIndex("barcode", "barcode", { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "tenant_id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineCatalog(input: SaveOfflineCatalogInput) {
  const db = await openOfflineCatalogDb();

  try {
    const transaction = db.transaction(
      [PRODUCTS_STORE, META_STORE],
      "readwrite"
    );
    const productsStore = transaction.objectStore(PRODUCTS_STORE);
    const tenantProductsIndex = productsStore.index("tenant_id");
    const existingKeys = await requestToPromise(
      tenantProductsIndex.getAllKeys(input.tenant.id)
    );

    existingKeys.forEach((key) => {
      productsStore.delete(key);
    });

    input.products.forEach((product) => {
      productsStore.put({
        ...product,
        tenant_id: input.tenant.id,
      });
    });

    const meta: OfflineCatalogMeta = {
      tenant_id: input.tenant.id,
      tenant_name: input.tenant.name,
      product_count: input.products.length,
      generated_at: input.generatedAt ?? null,
      saved_at: new Date().toISOString(),
    };

    transaction.objectStore(META_STORE).put(meta);

    await transactionDone(transaction);

    return meta;
  } finally {
    db.close();
  }
}

export async function searchOfflineProducts(
  tenantId: string,
  query: string,
  limit = 100
) {
  const db = await openOfflineCatalogDb();
  const normalizedQuery = normalizeSearchValue(query);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);

  try {
    const transaction = db.transaction(PRODUCTS_STORE, "readonly");
    const tenantProductsIndex = transaction
      .objectStore(PRODUCTS_STORE)
      .index("tenant_id");
    const results: OfflineCatalogProduct[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = tenantProductsIndex.openCursor(
        IDBKeyRange.only(tenantId)
      );

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor || results.length >= safeLimit) {
          resolve();
          return;
        }

        const product = cursor.value as OfflineCatalogProduct;

        if (productMatchesQuery(product, normalizedQuery)) {
          results.push(product);
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });

    await transactionDone(transaction);

    return results;
  } finally {
    db.close();
  }
}

export async function lookupOfflineProductByCode(
  tenantId: string,
  code: string
) {
  const normalizedCode = normalizeSearchValue(code);

  if (!normalizedCode) {
    return null;
  }

  const db = await openOfflineCatalogDb();

  try {
    const transaction = db.transaction(PRODUCTS_STORE, "readonly");
    const tenantProductsIndex = transaction
      .objectStore(PRODUCTS_STORE)
      .index("tenant_id");
    const exactMatch = await new Promise<OfflineCatalogProduct | null>(
      (resolve, reject) => {
        const request = tenantProductsIndex.openCursor(
          IDBKeyRange.only(tenantId)
        );

        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            resolve(null);
            return;
          }

          const product = cursor.value as OfflineCatalogProduct;

          if (
            product.active !== false &&
            productMatchesCode(product, normalizedCode)
          ) {
            resolve(product);
            return;
          }

          cursor.continue();
        };

        request.onerror = () => reject(request.error);
      }
    );

    await transactionDone(transaction);

    if (exactMatch) {
      return exactMatch;
    }
  } finally {
    db.close();
  }

  const fallbackProducts = await searchOfflineProducts(tenantId, code, 20);

  return fallbackProducts.find((product) => product.active !== false) ?? null;
}

export async function getOfflineCatalogMeta(tenantId: string) {
  const db = await openOfflineCatalogDb();

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const meta = await requestToPromise(
      transaction.objectStore(META_STORE).get(tenantId)
    );
    await transactionDone(transaction);

    return (meta as OfflineCatalogMeta | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function countOfflineProducts(tenantId: string) {
  const db = await openOfflineCatalogDb();

  try {
    const transaction = db.transaction(PRODUCTS_STORE, "readonly");
    const count = await requestToPromise(
      transaction.objectStore(PRODUCTS_STORE).index("tenant_id").count(tenantId)
    );
    await transactionDone(transaction);

    return count;
  } finally {
    db.close();
  }
}
