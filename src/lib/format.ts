function normalizeFormattedText(value: string) {
  return value.replace(/[\s\u00a0\u202f]+/g, " ").trim();
}

export function formatStockQuantity(value: number) {
  const rounded = Math.round(value);
  const displayValue = Math.abs(value - rounded) <= 0.0011 ? rounded : value;

  return normalizeFormattedText(
    new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 3,
    }).format(displayValue)
  );
}
