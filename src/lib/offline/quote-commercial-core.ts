import "server-only";

// B.3A: arithmetic/contract inspection only. Never an approval or RPC command.
type RecordValue = Record<string, unknown>;
const ZERO = BigInt(0);
const TEN = BigInt(10);
const MAX = TEN ** BigInt(14) - BigInt(1);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CommercialContractError extends Error {}
function invalid(): never { throw new CommercialContractError("Invalid offline quote contract"); }
function record(v: unknown): RecordValue {
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid();
  return v as RecordValue;
}
function keys(v: RecordValue, allowed: string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key))) invalid();
}
function text(v: unknown): string { return typeof v === "string" ? v : invalid(); }
function uuid(v: unknown): string { return typeof v === "string" && uuidPattern.test(v) ? v.toLowerCase() : invalid(); }
function nullableUuid(v: unknown) { return v === "" || v === null ? null : uuid(v); }

// Decimal decomposition of the serialized number, including scientific notation.
// No binary floating point is used for monetary arithmetic or comparison.
function decimal(v: unknown): { n: bigint; scale: number } {
  if (typeof v !== "number" && typeof v !== "string") return invalid();
  if (typeof v === "number" && !Number.isFinite(v)) return invalid();
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(v));
  if (!match || String(v).length > 100) return invalid();
  let scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
  if (Math.abs(scale) > 100) return invalid();
  let n = BigInt(match[1] + (match[2] ?? ""));
  if (scale < 0) { n *= TEN ** BigInt(-scale); scale = 0; }
  return { n, scale };
}
function scaled(v: unknown, scale: number, positive = false): bigint {
  const d = decimal(v);
  const divisor = TEN ** BigInt(Math.max(0, d.scale - scale));
  if (d.n % divisor !== ZERO) return invalid();
  const n = d.n / divisor * TEN ** BigInt(Math.max(0, scale - d.scale));
  if (n > MAX || (positive && n === ZERO)) return invalid();
  return n;
}
function round(n: bigint, divisor: bigint) { return (n + divisor / BigInt(2)) / divisor; }
function money(cents: bigint): string {
  return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
function fixed(n: bigint, scale: number): string {
  const base = TEN ** BigInt(scale);
  return `${n / base}.${String(n % base).padStart(scale, "0")}`;
}
function snapshotNumber(v: unknown, scale: number, positive = false) {
  if (typeof v !== "number") return invalid();
  return scaled(v, scale, positive);
}

export function parseCommercialDocument(value: unknown) {
  const envelope = record(value);
  keys(envelope, ["id", "tenant_id", "user_id", "type", "status", "payload", "created_at", "updated_at", "last_error", "attempt_count"]);
  if (envelope.type !== "quote_create" || !["pending", "failed", "syncing"].includes(text(envelope.status))) invalid();
  const payload = record(envelope.payload);
  keys(payload, ["customer", "lines", "total", "notes"]);
  const customer = record(payload.customer);
  keys(customer, ["id", "name", "phone", "email", "address"]);
  if (payload.notes !== "Presupuesto creado desde mostrador" || !Array.isArray(payload.lines) || !payload.lines.length || payload.lines.length > 1000) invalid();
  const lines = Array.from(payload.lines, (value, index) => {
    const line = record(value);
    keys(line, ["id", "sku", "displayCode", "name", "description", "unit", "quantity", "price", "selectedSaleUnitId", "selectedSaleUnitName", "quantityInBaseUnit"]);
    return {
      position: index + 1, productId: uuid(line.id), sku: text(line.sku),
      displayCode: text(line.displayCode), name: text(line.name), description: text(line.description), unit: text(line.unit),
      quantity: snapshotNumber(line.quantity, 3, true), price: snapshotNumber(line.price, 2),
      saleUnitId: nullableUuid(line.selectedSaleUnitId), saleUnitName: text(line.selectedSaleUnitName),
      factor: snapshotNumber(line.quantityInBaseUnit, 3, true),
    };
  });
  if (typeof payload.total !== "number") invalid();
  const total = decimal(payload.total);
  const scale = Math.max(6, total.scale);
  const actual = total.n * TEN ** BigInt(scale - total.scale);
  const sum = lines.reduce((s, l) => s + l.quantity * l.price, ZERO) * TEN ** BigInt(scale - 5);
  const difference = actual > sum ? actual - sum : sum - actual;
  // Legacy POS uses JS multiplication: this tolerance ONLY checks its raw sum.
  // It never tolerates a commercial price difference or rounds input precision.
  if (difference > TEN ** BigInt(scale - 6)) invalid();
  const displayedTotal = round(actual, TEN ** BigInt(scale - 2));
  if (displayedTotal > MAX) invalid();
  return {
    operationId: uuid(envelope.id), tenantId: uuid(envelope.tenant_id), ownerId: uuid(envelope.user_id),
    customer: { id: nullableUuid(customer.id), name: text(customer.name), phone: text(customer.phone), email: text(customer.email), address: text(customer.address) },
    lines, storedTotal: String(payload.total), displayedTotal,
  };
}
export type CommercialDocument = ReturnType<typeof parseCommercialDocument>;
export type Product = { id: string; tenant_id: string; name: string; unit: string; active: boolean; sale_price: number | string | null };
export type SaleUnit = { id: string; tenant_id: string; product_id: string; name: string; active: boolean; is_default: boolean; quantity_in_base_unit: number | string; sale_price: number | string | null };
export type IssueCode = "price_difference" | "name_difference" | "presentation_difference" | "factor_difference" | "unit_difference" | "product_missing" | "product_inactive" | "presentation_missing" | "presentation_inactive" | "presentation_ambiguous" | "price_missing" | "catalog_invalid" | "rounding_difference" | "customer_missing" | "amount_out_of_range";
export type CommercialIssue = { code: IssueCode; blocking: boolean; position?: number };

export function compareCommercialDocument(document: CommercialDocument, products: Product[], units: SaleUnit[], customerExists: boolean) {
  const issues: CommercialIssue[] = [];
  let offlineSum = ZERO;
  let currentSum = ZERO;
  let complete = true;
  const lines = document.lines.map((line) => {
    const add = (code: IssueCode, blocking = false) => issues.push({ code, blocking, position: line.position });
    const offlineTotal = round(line.quantity * line.price, BigInt(1000));
    offlineSum += offlineTotal;
    const offline = { name: line.name, quantity: fixed(line.quantity, 3), unit: line.unit, unitPrice: money(line.price), saleUnitId: line.saleUnitId, saleUnitName: line.saleUnitName, factor: fixed(line.factor, 3), total: money(offlineTotal) };
    let current: { name: string; quantity: string; unit: string; productPrice: string | null; effectivePrice: string; saleUnitId: string | null; saleUnitName: string; factor: string; total: string } | null = null;
    const product = products.find((p) => p.id === line.productId && p.tenant_id === document.tenantId);
    if (!product) add("product_missing", true);
    else if (!product.active) add("product_inactive", true);
    else {
      const candidates = units.filter((u) => u.tenant_id === document.tenantId && u.product_id === product.id && (line.saleUnitId ? u.id === line.saleUnitId : u.active && u.is_default));
      const unit = candidates[0];
      if (candidates.length > 1) add("presentation_ambiguous", true);
      else if (line.saleUnitId && !unit) add("presentation_missing", true);
      else if (unit && !unit.active) add("presentation_inactive", true);
      else {
        try {
          const productPrice = product.sale_price === null ? null : scaled(product.sale_price, 2);
          const effectivePrice = unit ? unit.sale_price : product.sale_price;
          if (effectivePrice === null) add("price_missing", true);
          else {
            const price = scaled(effectivePrice, 2);
            const factor = unit ? scaled(unit.quantity_in_base_unit, 3, true) : BigInt(1000);
            const total = round(line.quantity * price, BigInt(1000));
            const name = text(product.name), unitName = unit ? text(unit.name) : "Unidad";
            const baseUnit = text(product.unit);
            current = { name, quantity: offline.quantity, unit: baseUnit, productPrice: productPrice === null ? null : money(productPrice), effectivePrice: money(price), saleUnitId: unit?.id ?? null, saleUnitName: unitName, factor: fixed(factor, 3), total: money(total) };
            currentSum += total;
            if (price !== line.price) add("price_difference");
            if (name !== line.name) add("name_difference");
            if ((unit?.id ?? null) !== line.saleUnitId || unitName !== line.saleUnitName) add("presentation_difference");
            if (factor !== line.factor) add("factor_difference", true);
            if (baseUnit !== line.unit) add("unit_difference", true);
            if (total > MAX) add("amount_out_of_range", true);
          }
        } catch { add("catalog_invalid", true); }
      }
    }
    if (!current) complete = false;
    if (offlineTotal > MAX) add("amount_out_of_range", true);
    return { position: line.position, productId: line.productId, offline, current };
  });
  if (!customerExists) issues.push({ code: "customer_missing", blocking: true });
  if (offlineSum !== document.displayedTotal) issues.push({ code: "rounding_difference", blocking: false });
  if (offlineSum > MAX || currentSum > MAX) issues.push({ code: "amount_out_of_range", blocking: true });
  return {
    status: issues.some((i) => i.blocking) ? "blocked" as const : issues.length ? "differences" as const : "no_differences" as const,
    // Even no_differences is an advisory, non-transactional snapshot, NOT approval.
    canCreate: false as const, operationId: document.operationId, lines, issues,
    totals: { storedOffline: document.storedTotal, displayedOffline: money(document.displayedTotal), roundedOfflineLines: money(offlineSum), current: complete ? money(currentSum) : null, discount: "0.00", tax: "0.00" },
  };
}
