export function normalizeProductCode(value: string | null | undefined) {
  const clean = String(value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  return /[a-z]/.test(clean) ? clean.toUpperCase() : clean;
}

export function cleanProductCodeSearch(value: string | null | undefined) {
  return normalizeProductCode(value).replace(/[%_,()]/g, "");
}

export function isInheritedProductBarcode({
  barcode,
  sku,
}: {
  barcode: string | null | undefined;
  sku: string | null | undefined;
}) {
  const cleanBarcode = normalizeProductCode(barcode);
  const cleanSku = normalizeProductCode(sku);

  return Boolean(cleanBarcode && cleanSku && cleanBarcode === cleanSku);
}
