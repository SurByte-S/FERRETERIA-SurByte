export const DEFAULT_CATEGORY = "Sin categoría";
export const DEFAULT_BRAND = "0";
export const DEFAULT_UNIT = "unidad";

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeName(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeBarcode(value) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

export function isMeaningfulBarcode(value) {
  const text = normalizeText(value);
  return text.length > 0 && text !== "0";
}

export function parseArgentineNumber(value) {
  const raw = normalizeText(value);

  if (!raw) {
    return null;
  }

  let text = raw
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!text || text === "-" || text === "," || text === ".") {
    return null;
  }

  const negative = text.startsWith("-");
  text = text.replace(/-/g, "");

  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    const dotParts = text.split(".");

    if (dotParts.length > 1 && dotParts.at(-1)?.length === 3) {
      text = dotParts.join("");
    }
  }

  const parsed = Number(`${negative ? "-" : ""}${text}`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRequiredNumber(value, fieldName, errors, { min, max } = {}) {
  const parsed = parseArgentineNumber(value);

  if (parsed === null) {
    errors.push(`${fieldName} debe ser numérico.`);
    return 0;
  }

  if (typeof min === "number" && parsed < min) {
    errors.push(`${fieldName} debe ser mayor o igual a ${min}.`);
  }

  if (typeof max === "number" && parsed > max) {
    errors.push(`${fieldName} debe ser menor o igual a ${max}.`);
  }

  return parsed;
}

export function parseNumberWithDefault(value, fallback, fieldName, errors, range) {
  const text = normalizeText(value);

  if (!text) {
    return fallback;
  }

  return parseRequiredNumber(text, fieldName, errors, range);
}

export function parseNullableInteger(value, fieldName, errors) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const parsed = parseArgentineNumber(text);

  if (parsed === null || !Number.isInteger(parsed)) {
    errors.push(`${fieldName} debe ser entero.`);
    return null;
  }

  return parsed;
}

export function parseStrictBoolean(value, errors) {
  const text = normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["true", "1", "si", "activo"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "inactivo"].includes(text)) {
    return false;
  }

  errors.push("activo debe ser true, false, 1, 0, si, no, activo o inactivo.");
  return true;
}
