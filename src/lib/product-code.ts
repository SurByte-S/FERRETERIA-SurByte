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

export type BarcodeAssociationSaleUnit = {
  active?: boolean | null;
  barcode?: string | null;
  isDefault?: boolean | null;
  name?: string | null;
};

export type BarcodeAssociationProduct = {
  barcode?: string | null;
  barcodeStatus?: string | null;
  productBarcode?: string | null;
  saleUnits?: BarcodeAssociationSaleUnit[] | null;
  sku?: string | null;
};

export type BarcodeAssociationState =
  | {
      canAssign: false;
      message: string;
      primaryBarcode: string;
      saleUnitName?: string;
      status: "product_barcode" | "sale_unit_barcode";
      statusLabel: string;
      buttonLabel: string;
    }
  | {
      canAssign: true;
      message: string;
      primaryBarcode?: string;
      saleUnitName?: string;
      status: "empty" | "inherited_product_barcode" | "sale_unit_barcode";
      statusLabel: string;
      buttonLabel: string;
    };

export function hasNormalizedProductCode(value: string | null | undefined) {
  return normalizeProductCode(value) !== "";
}

export function hasRealProductBarcode({
  barcode,
  sku,
}: {
  barcode: string | null | undefined;
  sku: string | null | undefined;
}) {
  const cleanBarcode = normalizeProductCode(barcode);
  const cleanSku = normalizeProductCode(sku);

  return Boolean(cleanBarcode && cleanBarcode !== cleanSku);
}

export function getSaleUnitRealBarcode(
  saleUnit: BarcodeAssociationSaleUnit | null | undefined
) {
  return normalizeProductCode(saleUnit?.barcode);
}

export function getFirstSaleUnitWithRealBarcode(
  saleUnits: BarcodeAssociationSaleUnit[] | null | undefined
) {
  return (saleUnits ?? []).find(
    (unit) => unit.active !== false && hasNormalizedProductCode(unit.barcode)
  );
}

export function getBarcodeAssociationState(
  product: BarcodeAssociationProduct
): BarcodeAssociationState {
  const sku = normalizeProductCode(product.sku);
  const productBarcode = normalizeProductCode(
    product.productBarcode ?? product.barcode
  );
  const saleUnitWithBarcode = getFirstSaleUnitWithRealBarcode(product.saleUnits);

  if (productBarcode && productBarcode !== sku) {
    return {
      canAssign: false,
      message: `Codigo de barras cargado: ${productBarcode}`,
      primaryBarcode: productBarcode,
      status: "product_barcode",
      statusLabel: `Codigo de barras cargado: ${productBarcode}`,
      buttonLabel: "Este producto ya tiene otro codigo de barras",
    };
  }

  if (saleUnitWithBarcode) {
    const saleUnitName = saleUnitWithBarcode.name || "presentacion";
    const saleUnitBarcode = getSaleUnitRealBarcode(saleUnitWithBarcode);

    return {
      canAssign: true,
      message: `La presentacion ${saleUnitName} tiene codigo: ${saleUnitBarcode}`,
      primaryBarcode: saleUnitBarcode,
      saleUnitName,
      status: "sale_unit_barcode",
      statusLabel: `La presentacion ${saleUnitName} tiene codigo: ${saleUnitBarcode}`,
      buttonLabel: "Asociar codigo de barras principal",
    };
  }

  if (productBarcode && productBarcode === sku) {
    return {
      canAssign: true,
      message: "Codigo de catalogo heredado",
      primaryBarcode: productBarcode,
      status: "inherited_product_barcode",
      statusLabel: "Codigo de catalogo heredado",
      buttonLabel: "Asociar codigo real",
    };
  }

  return {
    canAssign: true,
    message: "Sin codigo de barras cargado",
    status: "empty",
    statusLabel: "Sin codigo de barras cargado",
    buttonLabel: "Asociar codigo real",
  };
}
