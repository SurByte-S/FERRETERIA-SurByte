export function normalizeProductCode(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim()
    .toUpperCase();
}

export function cleanProductCodeSearch(value: string | null | undefined) {
  return normalizeProductCode(value).replace(/[%_,()]/g, "");
}
