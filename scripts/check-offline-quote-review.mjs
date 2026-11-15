// B.3B isolated action + React HTML + request lifetime tests. No real browser/DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
const id = (n) => `${String(n).padStart(8, "0")}-1111-1111-1111-111111111111`;
const tenant = id(1), owner = id(2), product = id(3), unit = id(4);
let user, tables, reads, network;
function reset() {
  user = { id: owner }; reads = 0; network = false;
  tables = {
    tenant_members: [{ tenant_id: tenant, user_id: owner, active: true, role: "seller" }],
    tenants: [{ id: tenant }],
    products: [{ id: product, tenant_id: tenant, name: "Martillo", unit: "unidad", active: true, sale_price: 10 }],
    product_sale_units: [{ id: unit, tenant_id: tenant, product_id: product, name: "Unidad", active: true, is_default: true, quantity_in_base_unit: 1, sale_price: 10 }],
    customers: [],
  };
}
const db = { from(table) {
  assert.ok(Object.hasOwn(tables, table)); const filters = []; let single = false, limit = Infinity;
  // No write methods or RPC interface exists in this adapter.
  const q = {
    select() { reads++; return q; }, eq(k, v) { filters.push([k, v]); return q; }, is(k, v) { filters.push([k, v]); return q; },
    limit(n) { limit = n; return q; }, maybeSingle() { single = true; return q; },
    then(yes, no) {
      const rows = tables[table].filter((r) => filters.every(([k, v]) => r[k] === v)).slice(0, limit);
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: network ? { message: "secret upstream error" } : null }).then(yes, no);
    },
  }; return q;
} };
const cache = new Map();
function load(path) {
  path = resolve(path); if (cache.has(path)) return cache.get(path);
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/auth/session") return { getCurrentUser: async () => user };
    if (name === "@/lib/supabase") return { getSupabaseServerClient: () => db };
    if (name === "@/components/ui/button") return { Button: (props) => React.createElement("button", props) };
    if (name === "react" || name === "react/jsx-runtime") return nodeRequire(name);
    const base = name.startsWith("@/") ? resolve("src", name.slice(2)) : resolve(dirname(path), name);
    try { return load(`${base}.ts`); } catch (error) { if (error.code !== "ENOENT") throw error; return load(`${base}.tsx`); }
  } }, { filename: path });
  cache.set(path, exports); return exports;
}
const { reviewOfflineQuoteAction: review } = load("src/app/(dashboard)/configuracion/sincronizacion/review-actions.ts");
const { CommercialReviewResult } = load("src/components/pwa/offline-quote-review.tsx");
const { QuoteReviewRequest } = load("src/lib/offline/quote-review-request.ts");
const { OfflineSession, attachOfflineSession, captureOfflineSession } = load("src/lib/offline/offline-session.ts");
function pending() {
  return { id: id(5), tenant_id: tenant, user_id: owner, type: "quote_create", status: "pending",
    payload: { customer: { id: null, name: "", phone: "", email: "", address: "" }, notes: "Presupuesto creado desde mostrador", total: 20,
      lines: [{ id: product, sku: "M1", displayCode: "1", name: "Martillo", description: "Viejo", unit: "unidad", quantity: 2, price: 10, selectedSaleUnitId: unit, selectedSaleUnitName: "Unidad", quantityInBaseUnit: 1 }] } };
}
const html = (result) => renderToStaticMarkup(React.createElement(CommercialReviewResult, { result }));
const run = (doc = pending()) => review(JSON.stringify(doc));
let passed = 0;
async function test(name, fn) { reset(); await fn(); passed++; console.log(`OK ${name}`); }
await test("action no differences; HTML totals; original pending unchanged", async () => {
  const doc = pending(), original = JSON.stringify(doc); const result = await run(doc);
  assert.equal(result.status, "no_differences"); assert.equal(result.canCreate, false);
  assert.match(html(result), /Sin diferencias/); assert.match(html(result), /Total actualizado/);
  assert.equal(JSON.stringify(doc), original);
});
for (const [price, sign] of [[12, "+"], [8, "−"]]) await test(`price ${price}, presentation differs from base`, async () => {
  tables.product_sale_units[0].sale_price = price; const result = await run();
  assert.equal(result.status, "differences"); assert.equal(result.lines[0].current.productPrice, "10.00");
  assert.ok(html(result).includes(`${sign}$ 4,00`));
});
for (const [table, mutate, text] of [
  ["products", (rows) => rows.splice(0), "producto ya no"],
  ["products", (rows) => { rows[0].active = false; }, "producto está inactivo"],
  ["product_sale_units", (rows) => rows.splice(0), "presentación ya no"],
  ["product_sale_units", (rows) => { rows[0].active = false; }, "presentación está inactiva"],
  ["product_sale_units", (rows) => { rows[0].quantity_in_base_unit = 12; }, "cantidad de unidades"],
]) await test(text, async () => {
  mutate(tables[table]); const result = await run(); assert.equal(result.status, "blocked"); assert.ok(html(result).includes(text));
});
await test("renamed product displays both names", async () => {
  tables.products[0].name = "Martillo actual"; const output = html(await run());
  assert.match(output, /Martillo actual/); assert.match(output, /1\. Martillo/);
});
await test("repeated rows retain separate positions and original order", async () => {
  const doc = pending(); doc.payload.lines.push({ ...doc.payload.lines[0], name: "Tornillos" }, { ...doc.payload.lines[0], name: "Pinza" }); doc.payload.total = 60;
  const result = await run(doc); assert.equal(result.lines.length, 3);
  const output = html(result); assert.ok(output.indexOf("1. Martillo") < output.indexOf("2. Tornillos")); assert.ok(output.indexOf("2. Tornillos") < output.indexOf("3. Pinza"));
});
await test("network error is safe and contains no upstream message", async () => {
  network = true; const result = await run(); assert.equal(result.status, "verification_unavailable"); assert.doesNotMatch(html(result), /secret/);
});
for (const kind of ["expired", "user", "tenant", "role"]) await test(`server rejects ${kind}`, async () => {
  const doc = pending();
  if (kind === "expired") user = null;
  if (kind === "user") doc.user_id = id(99);
  if (kind === "tenant") doc.tenant_id = id(99);
  if (kind === "role") tables.tenant_members[0].role = "viewer";
  const result = await run(doc); assert.equal(result.status, "unauthorized"); assert.ok(!("lines" in result)); assert.match(html(result), /no tiene permiso/);
});
await test("size and query limits reject before any catalog access", async () => {
  assert.equal((await review("x".repeat(128001))).status, "contract_error");
  const doc = pending(); doc.payload.lines = Array(51).fill(doc.payload.lines[0]);
  assert.equal((await run(doc)).status, "contract_error");
  doc.payload.lines = Array.from({ length: 21 }, (_, n) => ({ ...pending().payload.lines[0], id: id(100 + n) }));
  assert.equal((await run(doc)).status, "contract_error"); assert.equal(reads, 0);
});
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function sessionHarness() {
  const scope = { tenantId: tenant, userId: owner, role: "seller", marker: "initial" };
  let marker = "initial", now = 1000, verified = { ...scope, validUntil: 200000 };
  const session = new OfflineSession(scope, { marker: () => marker, now: () => now, online: () => true, verify: async () => verified });
  await session.verify(); const detach = attachOfflineSession(session); const states = [];
  const request = new QuoteReviewRequest((state) => states.push(state));
  return { request, states, session, capture: () => captureOfflineSession(tenant, owner),
    changeMarker: () => { marker = "logout"; }, expire: () => { now = 200000; },
    changeUser: () => { verified = { ...verified, userId: id(99) }; }, changeTenant: () => { verified = { ...verified, tenantId: id(99) }; },
    close: () => { request.cancel(); detach(); },
  };
}
for (const change of ["marker", "user", "tenant", "expiry"]) await test(`late response after ${change} never becomes visible`, async () => {
  const h = await sessionHarness(), d = deferred(); const pending = h.request.run(h.capture, () => d.promise);
  if (change === "marker") h.changeMarker();
  if (change === "expiry") h.expire();
  if (change === "user") { h.changeUser(); await h.session.verify(); }
  if (change === "tenant") { h.changeTenant(); await h.session.verify(); }
  d.resolve(await run()); await pending;
  assert.ok(!h.states.some((s) => s.status === "result")); h.close();
});
await test("routine A.3 revalidation retains visible review", async () => {
  const h = await sessionHarness(); await h.request.run(h.capture, run); const count = h.states.length;
  await h.session.verify(); assert.equal(h.states.length, count); assert.equal(h.states.at(-1).status, "result");
  h.changeMarker(); h.session.check(); assert.equal(h.states.at(-1).status, "error"); h.close();
});
await test("close/unmount invalidates late result; next request can succeed", async () => {
  const h = await sessionHarness(), d = deferred(); const pending = h.request.run(h.capture, () => d.promise);
  h.request.cancel(); const count = h.states.length; d.resolve(await run()); await pending; assert.equal(h.states.length, count);
  await h.request.run(h.capture, run); assert.equal(h.states.at(-1).status, "result"); h.close();
});
await test("double click does not create parallel requests; rejected request clears old result", async () => {
  const h = await sessionHarness(), d = deferred(); let calls = 0;
  const pending = h.request.run(h.capture, () => { calls++; return d.promise; });
  await h.request.run(h.capture, run); assert.equal(calls, 1); d.resolve(await run()); await pending;
  await h.request.run(h.capture, async () => { throw new Error("secret network failure"); });
  assert.equal(h.states.at(-1).status, "error"); assert.doesNotMatch(h.states.at(-1).message, /secret/); h.close();
});
await test("new code contains no creation, price, queue or approval writes", async () => {
  for (const path of ["src/app/(dashboard)/configuracion/sincronizacion/review-actions.ts", "src/components/pwa/offline-quote-review.tsx", "src/lib/offline/quote-review-request.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\.rpc\(|\.(insert|update|upsert|delete)\(|syncSelectedSaleUnitPrices|localStorage|indexedDB|updateOfflineQueue/);
  }
  const panel = readFileSync("src/components/pwa/offline-quotes-panel.tsx", "utf8");
  assert.match(panel, /!props.canView \|\| !sessionReady/);
  assert.match(panel, /key=\{`\$\{props.tenantId\}:\$\{props.userId\}`\}/);
});
console.log(`${passed} B.3B isolated tests passed. Rendered React HTML; no real browser or Supabase execution.`);
