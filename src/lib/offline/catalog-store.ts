"use client";

const DB_NAME = "ferreteria-offline";
const DB_VERSION = 2;
const PRODUCTS_STORE = "offline_products";
const SALE_UNITS_STORE = "offline_sale_units";
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
  sale_unit_count?: number;
  generated_at?: string | null;
  saved_at: string;
};

export type OfflineSaleUnit = {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  quantity_in_base_unit: number | null;
  sale_price: number | null;
  barcode: string | null;
  is_default: boolean;
  active: boolean;
  updated_at: string | null;
};

export type OfflineCatalogLookupResult = {
  product: OfflineCatalogProduct;
  saleUnit?: OfflineSaleUnit;
  matchType: "product" | "sale_unit";
};

type SaveOfflineCatalogInput = {
  tenant: {
    id: string;
    name: string;
  };
  products: OfflineCatalogProduct[];
  saleUnits?: OfflineSaleUnit[];
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

function saleUnitMatchesQuery(saleUnit: OfflineSaleUnit, query: string) {
  if (!query) {
    return true;
  }

  return [saleUnit.name, saleUnit.barcode].some((value) =>
    normalizeSearchValue(value).includes(query)
  );
}

function productMatchesCode(product: OfflineCatalogProduct, code: string) {
  return [product.custom_code, product.sku, product.barcode].some(
    (value) => normalizeSearchValue(value) === code
  );
}

function saleUnitMatchesCode(saleUnit: OfflineSaleUnit, code: string) {
  return normalizeSearchValue(saleUnit.barcode) === code;
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

      if (!db.objectStoreNames.contains(SALE_UNITS_STORE)) {
        const saleUnitsStore = db.createObjectStore(SALE_UNITS_STORE, {
          keyPath: "id",
        });

        saleUnitsStore.createIndex("tenant_id", "tenant_id", {
          unique: false,
        });
        saleUnitsStore.createIndex("product_id", "product_id", {
          unique: false,
        });
        saleUnitsStore.createIndex("barcode", "barcode", { unique: false });
        saleUnitsStore.createIndex("name", "name", { unique: false });
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
      [PRODUCTS_STORE, SALE_UNITS_STORE, META_STORE],
      "readwrite"
    );
    const productsStore = transaction.objectStore(PRODUCTS_STORE);
    const saleUnitsStore = transaction.objectStore(SALE_UNITS_STORE);
    const tenantProductsIndex = productsStore.index("tenant_id");
    const tenantSaleUnitsIndex = saleUnitsStore.index("tenant_id");
    const existingKeys = await requestToPromise(
      tenantProductsIndex.getAllKeys(input.tenant.id)
    );
    const existingSaleUnitKeys = await requestToPromise(
      tenantSaleUnitsIndex.getAllKeys(input.tenant.id)
    );

    existingKeys.forEach((key) => {
      productsStore.delete(key);
    });

    existingSaleUnitKeys.forEach((key) => {
      saleUnitsStore.delete(key);
    });

    input.products.forEach((product) => {
      productsStore.put({
        ...product,
        tenant_id: input.tenant.id,
      });
    });

    const saleUnits = input.saleUnits ?? [];

    saleUnits.forEach((saleUnit) => {
      saleUnitsStore.put({
        ...saleUnit,
        tenant_id: input.tenant.id,
      });
    });

    const meta: OfflineCatalogMeta = {
      tenant_id: input.tenant.id,
      tenant_name: input.tenant.name,
      product_count: input.products.length,
      sale_unit_count: saleUnits.length,
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
    const transaction = db.transaction(
      [PRODUCTS_STORE, SALE_UNITS_STORE],
      "readonly"
    );
    const tenantProductsIndex = transaction
      .objectStore(PRODUCTS_STORE)
      .index("tenant_id");
    const productsStore = transaction.objectStore(PRODUCTS_STORE);
    const tenantSaleUnitsIndex = transaction
      .objectStore(SALE_UNITS_STORE)
      .index("tenant_id");
    const results: OfflineCatalogProduct[] = [];
    const productIds = new Set<string>();

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
          productIds.add(product.id);
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });

    if (results.length < safeLimit && normalizedQuery) {
      await new Promise<void>((resolve, reject) => {
        const request = tenantSaleUnitsIndex.openCursor(
          IDBKeyRange.only(tenantId)
        );

        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor || results.length >= safeLimit) {
            resolve();
            return;
          }

          const saleUnit = cursor.value as OfflineSaleUnit;

          if (
            saleUnit.active !== false &&
            !productIds.has(saleUnit.product_id) &&
            saleUnitMatchesQuery(saleUnit, normalizedQuery)
          ) {
            const productRequest = productsStore.get(saleUnit.product_id);

            productRequest.onsuccess = () => {
              const product = productRequest.result as
                | OfflineCatalogProduct
                | undefined;

              if (
                product &&
                product.tenant_id === tenantId &&
                product.active !== false
              ) {
                results.push(product);
                productIds.add(product.id);
              }

              cursor.continue();
            };
            productRequest.onerror = () => reject(productRequest.error);
            return;
          }

          cursor.continue();
        };

        request.onerror = () => reject(request.error);
      });
    }

    await transactionDone(transaction);

    return results;
  } finally {
    db.close();
  }
}

export async function lookupOfflineProductByCode(
  tenantId: string,
  code: string
): Promise<OfflineCatalogLookupResult | null> {
  const normalizedCode = normalizeSearchValue(code);

  if (!normalizedCode) {
    return null;
  }

  const db = await openOfflineCatalogDb();

  try {
    const productTransaction = db.transaction(PRODUCTS_STORE, "readonly");
    const tenantProductsIndex = productTransaction
      .objectStore(PRODUCTS_STORE)
      .index("tenant_id");
    const exactProduct = await new Promise<OfflineCatalogProduct | null>(
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

    await transactionDone(productTransaction);

    if (exactProduct) {
      return {
        product: exactProduct,
        matchType: "product",
      };
    }

    const saleUnitTransaction = db.transaction(
      [PRODUCTS_STORE, SALE_UNITS_STORE],
      "readonly"
    );
    const productsStore = saleUnitTransaction.objectStore(PRODUCTS_STORE);
    const tenantSaleUnitsIndex = saleUnitTransaction
      .objectStore(SALE_UNITS_STORE)
      .index("tenant_id");
    const exactSaleUnit = await new Promise<{
      product: OfflineCatalogProduct;
      saleUnit: OfflineSaleUnit;
    } | null>((resolve, reject) => {
      const request = tenantSaleUnitsIndex.openCursor(IDBKeyRange.only(tenantId));

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve(null);
          return;
        }

        const saleUnit = cursor.value as OfflineSaleUnit;

        if (saleUnit.active !== false && saleUnitMatchesCode(saleUnit, normalizedCode)) {
          const productRequest = productsStore.get(saleUnit.product_id);

          productRequest.onsuccess = () => {
            const product = productRequest.result as
              | OfflineCatalogProduct
              | undefined;

            if (
              product &&
              product.tenant_id === tenantId &&
              product.active !== false
            ) {
              resolve({ product, saleUnit });
              return;
            }

            cursor.continue();
          };
          productRequest.onerror = () => reject(productRequest.error);
          return;
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });

    await transactionDone(saleUnitTransaction);

    if (exactSaleUnit) {
      return {
        product: exactSaleUnit.product,
        saleUnit: exactSaleUnit.saleUnit,
        matchType: "sale_unit",
      };
    }
  } finally {
    db.close();
  }

  const fallbackProducts = await searchOfflineProducts(tenantId, code, 20);
  const fallbackProduct =
    fallbackProducts.find((product) => product.active !== false) ?? null;

  return fallbackProduct
    ? {
        product: fallbackProduct,
        matchType: "product",
      }
    : null;
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

export async function countOfflineSaleUnits(tenantId: string) {
  const db = await openOfflineCatalogDb();

  try {
    const transaction = db.transaction(SALE_UNITS_STORE, "readonly");
    const count = await requestToPromise(
      transaction.objectStore(SALE_UNITS_STORE).index("tenant_id").count(tenantId)
    );
    await transactionDone(transaction);

    return count;
  } finally {
    db.close();
  }
}
