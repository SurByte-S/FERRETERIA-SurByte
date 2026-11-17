import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { compareCommercialDocument, parseCommercialDocument, type Product, type SaleUnit } from "./quote-commercial-core";

// Pure preparation only. No route/action imports this module. These arguments
// MUST come from authenticated server reads, never a browser-provided context.
export type VerifiedApprovalIdentity = {
  actorId: string; tenantId: string; role: "owner" | "admin" | "seller";
  membershipActive: boolean; verifiedUntil: number;
};
export type ApprovalCatalog = {
  products: (Product & { revision: string })[];
  units: (SaleUnit & { revision: string })[];
  customerExists: boolean;
};
export type ProposalKey = { id: string; secret: Uint8Array };
const VERSION = 2;
const TTL = 5 * 60_000;
const PURPOSE = "offline-quote-review-proposal";
const NOTES = "Presupuesto creado desde mostrador";
const fail = (): never => { throw new Error("OFFLINE_PROPOSAL_INVALID"); };

// Canonical bytes v2: UTF-8 JSON, sorted ASCII object keys, ordered arrays,
// unchanged Unicode strings, no floating-point numbers/undefined/BigInt.
// This is NOT PostgreSQL jsonb::text (which has different whitespace/key order).
export function canonicalProposalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonicalProposalJson).join(",")}]`;
  if (value && typeof value === "object" && Object.prototype.toString.call(value) === "[object Object]") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalProposalJson(object[key])}`).join(",")}}`;
  }
  return fail();
}
function hash(value: unknown) { return createHash("sha256").update(canonicalProposalJson(value), "utf8").digest("hex"); }
function fixed(value: bigint, scale: number) {
  const base = BigInt(10) ** BigInt(scale);
  return `${value / base}.${String(value % base).padStart(scale, "0")}`;
}
function identity(input: unknown, context: VerifiedApprovalIdentity, now: number) {
  const document = parseCommercialDocument(input);
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(context.verifiedUntil) || context.verifiedUntil <= now ||
      !context.membershipActive || !["owner", "admin", "seller"].includes(context.role) ||
      document.ownerId !== context.actorId || document.tenantId !== context.tenantId) fail();
  return document;
}
function source(document: ReturnType<typeof parseCommercialDocument>) {
  return {
    version: VERSION, operationId: document.operationId, tenantId: document.tenantId, ownerId: document.ownerId,
    customer: document.customer, notes: NOTES, storedTotal: document.storedTotal,
    lines: document.lines.map((line) => ({ ...line, quantity: fixed(line.quantity, 3), price: fixed(line.price, 2), factor: fixed(line.factor, 3) })),
  };
}
function revision(value: unknown) {
  // Preserve PostgreSQL microseconds; do not round updated_at through JS Date.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return fail();
  return value.replace("+00:00", "Z").replace(/(?:\.(\d+))?Z$/, (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(6, "0")}Z`);
}

export function buildCommercialProposal(input: unknown, context: VerifiedApprovalIdentity, catalog: ApprovalCatalog, issuedAt: number) {
  const document = identity(input, context, issuedAt);
  const comparison = compareCommercialDocument(document, catalog.products, catalog.units, catalog.customerExists);
  if (comparison.status === "blocked" || comparison.totals.current === null) return fail();
  const commercial = {
    policy: "current-catalog-v1", customer: document.customer, notes: NOTES,
    lines: comparison.lines.map((line) => {
      if (!line.current) return fail();
      const product = catalog.products.find((p) => p.id === line.productId && p.tenant_id === context.tenantId);
      const unit = line.current.saleUnitId === null ? null : catalog.units.find((u) => u.id === line.current!.saleUnitId && u.product_id === line.productId && u.tenant_id === context.tenantId);
      if (!product || !product.active || (line.current.saleUnitId !== null && (!unit || !unit.active))) return fail();
      return {
        position: line.position, productId: line.productId, ...line.current,
        productActive: true, productRevision: revision(product.revision),
        presentationActive: unit ? true : null, presentationDefault: unit ? unit.is_default : null,
        presentationRevision: unit ? revision(unit.revision) : null,
        resolution: unit ? "explicit-unit" : "virtual-base-unit", discount: "0.00",
      };
    }),
    subtotal: comparison.totals.current, total: comparison.totals.current, discount: "0.00", tax: "0.00",
  };
  const sourceFingerprint = hash(source(document));
  const proposalFingerprint = hash({ version: VERSION, operationId: document.operationId, tenantId: document.tenantId, ownerId: document.ownerId, sourceFingerprint, commercial });
  return {
    purpose: PURPOSE, version: VERSION, canCreate: false as const,
    operationId: document.operationId, actorId: context.actorId, tenantId: context.tenantId,
    ownerId: document.ownerId, role: context.role, sourceFingerprint, proposalFingerprint, commercial,
    issuedAt, expiresAt: Math.min(issuedAt + TTL, context.verifiedUntil),
  };
}
export type CommercialProposal = ReturnType<typeof buildCommercialProposal>;
function checkKey(key: ProposalKey) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key.id) || key.secret.byteLength < 32) fail();
}
// Pure issuer: caller supplies a secret managed ONLY by the server. This phase
// installs no production secret and wires no issuer into B.3B.
export function issueCommercialProposal(input: unknown, context: VerifiedApprovalIdentity, catalog: ApprovalCatalog, now: number, key: ProposalKey) {
  checkKey(key);
  const proposal = buildCommercialProposal(input, context, catalog, now);
  const payload = Buffer.from(canonicalProposalJson(proposal), "utf8").toString("base64url");
  const message = `${key.id}.${payload}`;
  const signature = createHmac("sha256", key.secret).update(message).digest("base64url");
  return { proposal, token: `${message}.${signature}` };
}

// Pure verification against FRESH trusted reads. NOT a transactional approval.
// Never pass its success to a creation RPC without the later SQL checks.
export function verifyCommercialProposal(token: string, input: unknown, context: VerifiedApprovalIdentity, catalog: ApprovalCatalog, now: number, key: ProposalKey) {
  try {
    checkKey(key);
    if (typeof token !== "string" || token.length > 1_000_000) fail();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== key.id || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) fail();
    const expected = createHmac("sha256", key.secret).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) fail();
    const supplied = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!Number.isSafeInteger(supplied.issuedAt) || !Number.isSafeInteger(supplied.expiresAt) ||
        supplied.issuedAt < 0 || supplied.issuedAt > now || now >= supplied.expiresAt ||
        supplied.expiresAt > supplied.issuedAt + TTL || supplied.expiresAt <= supplied.issuedAt) fail();
    // Authorize NOW, not at the proposal's old issue time.
    identity(input, context, now);
    const fresh = buildCommercialProposal(input, context, catalog, now);
    const expectedProposal = { ...fresh, issuedAt: supplied.issuedAt, expiresAt: supplied.expiresAt };
    if (canonicalProposalJson(supplied) !== canonicalProposalJson(expectedProposal)) fail();
    return { status: "valid_proposal" as const, canCreate: false as const, proposal: expectedProposal };
  } catch {
    return { status: "review_required" as const, canCreate: false as const };
  }
}

export type ConfirmedOperationReceipt = {
  version: 2; operationId: string; tenantId: string; ownerId: string;
  sourceFingerprint: string; proposalFingerprint: string;
  remoteQuoteId: string; quoteNumber: string; total: string; confirmedAt: string;
};
// Separate recovery contract. Receipt must come from trusted DB, not the client.
// Expired proposals/catalog changes do not require approval AGAIN after commit.
export function inspectConfirmedOperation(input: unknown, context: VerifiedApprovalIdentity, receipt: ConfirmedOperationReceipt, now: number, expectedProposalFingerprint?: string) {
  try {
    const document = identity(input, context, now);
    if (receipt.version !== VERSION || receipt.operationId !== document.operationId || receipt.tenantId !== context.tenantId ||
        receipt.ownerId !== context.actorId || receipt.sourceFingerprint !== hash(source(document)) ||
        !/^[0-9a-f]{64}$/.test(receipt.proposalFingerprint) ||
        (expectedProposalFingerprint !== undefined && expectedProposalFingerprint !== receipt.proposalFingerprint)) fail();
    return { status: "already_confirmed" as const, canCreate: false as const,
      result: { remoteQuoteId: receipt.remoteQuoteId, quoteNumber: receipt.quoteNumber, total: receipt.total, confirmedAt: receipt.confirmedAt } };
  } catch { return { status: "operation_mismatch" as const, canCreate: false as const }; }
}
