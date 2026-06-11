type SearchableProduct = {
  barcode?: string | null;
  code?: string | null;
  description?: string | null;
  name: string;
  normalizedName?: string | null;
  saleUnitBarcodes?: string[] | null;
  sku: string;
};

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldRank(value: string | null | undefined, search: string, exactRank: number, startsRank: number, containsRank: number) {
  const normalized = normalizeSearchText(value);

  if (!normalized || !search) {
    return Number.POSITIVE_INFINITY;
  }

  if (normalized === search) {
    return exactRank;
  }

  if (normalized.startsWith(search)) {
    return startsRank;
  }

  if (normalized.includes(search)) {
    return containsRank;
  }

  return Number.POSITIVE_INFINITY;
}

export function getProductSearchRank(product: SearchableProduct, rawSearch: string) {
  const search = normalizeSearchText(rawSearch);
  const saleUnitBarcodes = product.saleUnitBarcodes?.join(" ") ?? "";

  if (!search) {
    return 0;
  }

  return Math.min(
    fieldRank(product.sku, search, 0, 2, 5),
    fieldRank(product.barcode, search, 0, 2, 5),
    fieldRank(product.code, search, 0, 2, 5),
    fieldRank(saleUnitBarcodes, search, 0, 2, 5),
    fieldRank(product.name, search, 1, 3, 6),
    fieldRank(product.normalizedName, search, 1, 3, 6),
    fieldRank(product.description, search, 4, 4, 7)
  );
}

export function sortProductsBySearchRank<T extends SearchableProduct>(products: T[], rawSearch: string) {
  const search = normalizeSearchText(rawSearch);

  if (!search) {
    return [...products].sort((first, second) =>
      first.name.localeCompare(second.name, "es-AR") || first.sku.localeCompare(second.sku, "es-AR")
    );
  }

  return [...products].sort((first, second) => {
    const rankDifference =
      getProductSearchRank(first, search) - getProductSearchRank(second, search);

    return (
      rankDifference ||
      first.name.length - second.name.length ||
      first.name.localeCompare(second.name, "es-AR") ||
      first.sku.localeCompare(second.sku, "es-AR")
    );
  });
}
