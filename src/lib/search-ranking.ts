type SearchableProduct = {
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  code?: string | null;
  description?: string | null;
  name: string;
  normalizedName?: string | null;
  sku: string;
};

const SEARCH_STOP_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "un",
  "una",
  "y",
]);

export function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSearchTokens(value: string | null | undefined) {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !SEARCH_STOP_WORDS.has(token));
}

export function matchesAllSearchTokens(
  product: SearchableProduct,
  rawSearch: string
) {
  const tokens = getSearchTokens(rawSearch);

  if (tokens.length === 0) {
    return true;
  }

  const searchableText = normalizeSearchText(
    [
      product.sku,
      product.barcode,
      product.brand,
      product.category,
      product.code,
      product.name,
      product.normalizedName,
      product.description,
    ].join(" ")
  );

  return tokens.every((token) =>
    getTokenVariants(token).some((variant) => searchableText.includes(variant))
  );
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

  if (!search) {
    return 0;
  }

  return Math.min(
    fieldRank(product.sku, search, 0, 2, 5),
    fieldRank(product.barcode, search, 0, 2, 5),
    fieldRank(product.code, search, 0, 2, 5),
    fieldRank(product.name, search, 1, 3, 6),
    fieldRank(product.normalizedName, search, 1, 3, 6),
    fieldRank(product.description, search, 4, 4, 7)
  );
}

export function sortProductsBySearchRank<T extends SearchableProduct>(products: T[], rawSearch: string) {
  const search = normalizeSearchText(rawSearch);
  const tokens = getSearchTokens(rawSearch);

  if (!search) {
    return [...products].sort((first, second) =>
      first.name.localeCompare(second.name, "es-AR") || first.sku.localeCompare(second.sku, "es-AR")
    );
  }

  return [...products].sort((first, second) => {
    const rankDifference =
      getProductSearchRank(first, search) - getProductSearchRank(second, search);
    const firstTokenMatches = countTokenMatches(first, tokens);
    const secondTokenMatches = countTokenMatches(second, tokens);

    return (
      rankDifference ||
      secondTokenMatches - firstTokenMatches ||
      first.name.length - second.name.length ||
      first.name.localeCompare(second.name, "es-AR") ||
      first.sku.localeCompare(second.sku, "es-AR")
    );
  });
}

function countTokenMatches(product: SearchableProduct, tokens: string[]) {
  if (tokens.length === 0) {
    return 0;
  }

  const searchableText = normalizeSearchText(
    [
      product.sku,
      product.barcode,
      product.brand,
      product.category,
      product.code,
      product.name,
      product.normalizedName,
      product.description,
    ].join(" ")
  );

  return tokens.filter((token) =>
    getTokenVariants(token).some((variant) => searchableText.includes(variant))
  ).length;
}

function getTokenVariants(token: string) {
  if (token.startsWith("electric")) {
    return [token, "electric"];
  }

  return [token];
}
