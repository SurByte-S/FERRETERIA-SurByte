// Pure contract tests. No network, SQL, environment secrets or browser storage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
const cache = new Map();
function load(path) {
  path = resolve(path); if (cache.has(path)) return cache.get(path);
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  vm.runInNewContext(compiled.outputText, { exports, Buffer, require(name) {
    if (name === "server-only") return {};
    if (name === "node:crypto") return crypto;
    if (name === "./quote-commercial-core") return load(resolve(dirname(path), `${name}.ts`));
    throw new Error(`Unexpected dependency: ${name}`);
  } }); cache.set(path, exports); return exports;
}
const api = load("src/lib/offline/quote-approval-contract.ts");
const id = (n) => `${String(n).padStart(8, "0")}-1111-1111-1111-111111111111`;
const now = 1800000000000;
const key = { id: "isolated-test", secret: new Uint8Array(32).fill(123) };
function fixture() {
  const context = { actorId: id(1), tenantId: id(2), role: "seller", membershipActive: true, verifiedUntil: now + 600000 };
  const input = { id: id(3), user_id: id(1), tenant_id: id(2), type: "quote_create", status: "pending", payload: {
    customer: { id: null, name: "Ana", phone: "", email: "", address: "" }, notes: "Presupuesto creado desde mostrador", total: 20,
    lines: [{ id: id(4), name: "Martillo", sku: "M1", displayCode: "1", description: "Viejo", unit: "unidad", quantity: 2, price: 10, selectedSaleUnitId: id(5), selectedSaleUnitName: "Unidad", quantityInBaseUnit: 1 }],
  } };
  const catalog = { customerExists: true,
    products: [{ id: id(4), tenant_id: id(2), name: "Martillo", unit: "unidad", active: true, sale_price: 10, revision: "2026-11-15T10:00:00.123456Z" }],
    units: [{ id: id(5), tenant_id: id(2), product_id: id(4), name: "Unidad", active: true, is_default: true, sale_price: 12, quantity_in_base_unit: 1, revision: "2026-11-15T10:00:00Z" }],
  };
  const issued = api.issueCommercialProposal(input, context, catalog, now, key);
  return { input, context, catalog, ...issued };
}
const verify = (f, time = now + 1, token = f.token) => api.verifyCommercialProposal(token, f.input, f.context, f.catalog, time, key);
let passed = 0;
function test(name, fn) { fn(fixture()); passed++; console.log(`OK ${name}`); }
test("same signed proposal and original, never creation permission", (f) => {
  const before = JSON.stringify(f.input); const r = verify(f);
  assert.equal(r.status, "valid_proposal"); assert.equal(r.canCreate, false);
  assert.equal(r.proposal.commercial.total, "24.00"); assert.equal(r.proposal.commercial.lines[0].quantity, "2.000");
  assert.equal(JSON.stringify(f.input), before);
});
for (const [name, mutate] of [
  ["customer", (f) => { f.input.payload.customer.name = "Otra"; }],
  ["offline name", (f) => { f.input.payload.lines[0].name = "Otro"; }],
  ["quantity", (f) => { f.input.payload.lines[0].quantity = 3; f.input.payload.total = 30; }],
  ["price", (f) => { f.catalog.units[0].sale_price = 13; }],
  ["base price", (f) => { f.catalog.products[0].sale_price = 9; }],
  ["factor", (f) => { f.catalog.units[0].quantity_in_base_unit = 2; }],
  ["state", (f) => { f.catalog.products[0].active = false; }],
  ["unit state", (f) => { f.catalog.units[0].active = false; }],
  ["name", (f) => { f.catalog.products[0].name = "Nuevo"; }],
  ["revision even after same-value restoration", (f) => { f.catalog.products[0].revision = "2026-11-15T10:01:00Z"; }],
  ["missing revision", (f) => { delete f.catalog.units[0].revision; }],
  ["missing product", (f) => { f.catalog.products = []; }],
  ["customer removed", (f) => { f.catalog.customerExists = false; }],
  ["user", (f) => { f.context.actorId = id(99); }],
  ["tenant", (f) => { f.context.tenantId = id(99); }],
  ["role", (f) => { f.context.role = "viewer"; }],
  ["membership", (f) => { f.context.membershipActive = false; }],
  ["operation UUID", (f) => { f.input.id = id(99); }],
]) test(`reject change: ${name}`, (f) => { mutate(f); assert.equal(verify(f).status, "review_required"); });
test("expiration exact boundary, future issue time, auth expiry", (f) => {
  assert.equal(verify(f, now + 300000 - 1).status, "valid_proposal");
  assert.equal(verify(f, now + 300000).status, "review_required");
  assert.equal(verify(f, now - 1).status, "review_required");
  f.context.verifiedUntil = now; assert.equal(verify(f).status, "review_required");
});
test("proposal deadline never exceeds verified session deadline", (f) => {
  f.context.verifiedUntil = now + 1000;
  const issued = api.issueCommercialProposal(f.input, f.context, f.catalog, now, key);
  assert.equal(issued.proposal.expiresAt, now + 1000);
});
test("signature, key ID and tampered unsigned fields", (f) => {
  assert.equal(verify(f, now + 1, f.token + "x").status, "review_required");
  const parts = f.token.split("."); const body = JSON.parse(Buffer.from(parts[1], "base64url"));
  body.commercial.total = "1.00"; parts[1] = Buffer.from(JSON.stringify(body)).toString("base64url");
  assert.equal(verify(f, now + 1, parts.join(".")).status, "review_required");
  assert.equal(api.verifyCommercialProposal(f.token, f.input, f.context, f.catalog, now + 1, { ...key, id: "other" }).status, "review_required");
  assert.throws(() => api.issueCommercialProposal(f.input, f.context, f.catalog, now, { id: "bad", secret: new Uint8Array(2) }));
});
test("decimal normalization and key ordering", (f) => {
  f.catalog.units[0].sale_price = "12.00"; f.catalog.units[0].quantity_in_base_unit = "1.000";
  f.catalog.units[0].revision = "2026-11-15T10:00:00.000000+00:00";
  assert.equal(verify(f).status, "valid_proposal");
  assert.equal(api.canonicalProposalJson({ b: "2.00", a: "1.000" }), '{"a":"1.000","b":"2.00"}');
  assert.throws(() => api.canonicalProposalJson({ decimal: 1.5 }));
});
test("order and repeated lines bound to positions", (f) => {
  f.input.payload.lines.push({ ...f.input.payload.lines[0], quantity: 1 }); f.input.payload.total = 30;
  const issued = api.issueCommercialProposal(f.input, f.context, f.catalog, now, key); f.token = issued.token;
  assert.equal(issued.proposal.commercial.lines.length, 2);
  assert.equal(issued.proposal.commercial.lines[1].position, 2);
  assert.equal(verify(f).status, "valid_proposal");
  f.input.payload.lines.reverse(); assert.equal(verify(f).status, "review_required");
});
test("retry metadata and renewed token preserve command fingerprints", (f) => {
  f.input.status = "failed"; f.input.attempt_count = 4; f.input.last_error = "timeout";
  const renewed = api.issueCommercialProposal(f.input, f.context, f.catalog, now + 1000, key);
  assert.equal(renewed.proposal.sourceFingerprint, f.proposal.sourceFingerprint);
  assert.equal(renewed.proposal.proposalFingerprint, f.proposal.proposalFingerprint);
  assert.notEqual(renewed.token, f.token);
});
test("confirmed receipt survives expired proposal and changed catalog", (f) => {
  const receipt = { version: 2, operationId: f.input.id, tenantId: f.context.tenantId, ownerId: f.context.actorId,
    sourceFingerprint: f.proposal.sourceFingerprint, proposalFingerprint: f.proposal.proposalFingerprint,
    remoteQuoteId: id(8), quoteNumber: "9007199254740993", total: "24.00", confirmedAt: "2026-11-15T10:01:00Z" };
  f.catalog.products = [];
  let r = api.inspectConfirmedOperation(f.input, f.context, receipt, now + 300001);
  assert.equal(r.status, "already_confirmed"); assert.equal(r.result.quoteNumber, receipt.quoteNumber); assert.equal(r.canCreate, false);
  assert.equal(api.inspectConfirmedOperation(f.input, f.context, receipt, now + 1, "a".repeat(64)).status, "operation_mismatch");
  f.input.payload.customer.name = "Otro comando con el mismo UUID";
  assert.equal(api.inspectConfirmedOperation(f.input, f.context, receipt, now + 1).status, "operation_mismatch");
  f.input.payload.customer.name = "Ana"; f.context.actorId = id(99);
  r = api.inspectConfirmedOperation(f.input, f.context, receipt, now + 1); assert.equal(r.status, "operation_mismatch");
});
test("no writes, auth changes or public issuer", () => {
  const source = readFileSync("src/lib/offline/quote-approval-contract.ts", "utf8");
  assert.match(source, /^import "server-only"/);
  // Hash.update and Buffer.from are local crypto operations. The loader above
  // rejects all imports except crypto, server-only and the pure B.3A core.
  assert.doesNotMatch(source, /["']use server["']|\.rpc\(|\.(insert|upsert|delete)\(|process\.env|indexedDB|supabase/);
  for (const path of ["src/components/pwa/offline-quote-review.tsx", "src/app/(dashboard)/configuracion/sincronizacion/review-actions.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /quote-approval-contract|issueCommercialProposal/);
  }
});
console.log(`${passed} pure approval contract tests passed; no SQL, remote calls or writes.`);
