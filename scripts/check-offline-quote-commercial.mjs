// Isolated B.3A tests. No network, SQL, credentials, browser or IndexedDB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const id = (n) => `${String(n).padStart(8, "0")}-1111-1111-1111-111111111111`;
const tenant = id(1), owner = id(2), product = id(3), unit = id(4);
let user, tables, calls, failTable, failAuth;
function reset() {
  user = { id: owner }; calls = []; failTable = null; failAuth = false;
  tables = {
    tenant_members: [{ tenant_id: tenant, user_id: owner, active: true, role: "seller" }],
    tenants: [{ id: tenant }],
    products: [{ id: product, tenant_id: tenant, name: "Martillo", unit: "unidad", active: true, sale_price: 10 }],
    product_sale_units: [{ id: unit, tenant_id: tenant, product_id: product, name: "Unidad", active: true, is_default: true, quantity_in_base_unit: 1, sale_price: 10 }],
    customers: [],
  };
}
const db = {
  from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    const filters = [];
    let limit = Infinity, single = false;
    // Deliberately NO insert/update/delete/upsert/rpc methods: any write fails.
    const query = {
      select(columns) { calls.push({ table, columns, filters }); return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; },
      limit(value) { limit = value; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        const rows = tables[table].filter((r) => filters.every(([k, v]) => r[k] === v)).slice(0, limit);
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: table === failTable ? { message: "Unavailable" } : null }).then(resolve, reject);
      },
    };
    return query;
  },
};
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/auth/session") return { getCurrentUser: async () => { if (failAuth) throw new Error("Network"); return user; } };
      if (name === "@/lib/supabase") return { getSupabaseServerClient: () => db };
      if (name === "./quote-commercial-core") return load("src/lib/offline/quote-commercial-core.ts");
      throw new Error(`Unexpected dependency ${name}`);
    },
  }, { filename: path });
  cache.set(path, exports);
  return exports;
}
const { validateOfflineQuoteCommercial: validate } = load("src/lib/offline/validate-quote-commercial.ts");
function pending() {
  return { id: id(5), tenant_id: tenant, user_id: owner, type: "quote_create", status: "pending", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", last_error: null, attempt_count: 0,
    payload: { customer: { id: null, name: "", phone: "", email: "", address: "" }, notes: "Presupuesto creado desde mostrador", total: 20,
      lines: [{ id: product, sku: "M1", displayCode: "1", name: "Martillo", description: "Viejo", unit: "unidad", quantity: 2, price: 10, selectedSaleUnitId: unit, selectedSaleUnitName: "Unidad", quantityInBaseUnit: 1 }] } };
}
const has = (result, code) => result.issues?.some((i) => i.code === code);
let passed = 0;
async function test(name, run) { reset(); await run(); passed++; console.log(`OK ${name}`); }
await test("legacy pending without version/discount/line totals: no differences; no mutation", async () => {
  const doc = pending(), before = JSON.stringify(doc);
  const r = await validate(doc);
  assert.equal(r.status, "no_differences"); assert.equal(r.canCreate, false);
  assert.equal(r.totals.current, "20.00"); assert.equal(JSON.stringify(doc), before);
});
for (const price of [12, 8]) await test(`effective price ${price}: difference, never automatic approval`, async () => {
  tables.product_sale_units[0].sale_price = price;
  const r = await validate(pending()); assert.equal(r.status, "differences"); assert.ok(has(r, "price_difference")); assert.equal(r.canCreate, false);
  assert.equal(r.lines[0].current.productPrice, "10.00"); assert.equal(r.lines[0].current.effectivePrice, `${price}.00`);
});
await test("base price differs from presentation: calculate using presentation, not base", async () => {
  tables.products[0].sale_price = 99;
  const r = await validate(pending()); assert.equal(r.totals.current, "20.00"); assert.equal(r.lines[0].current.productPrice, "99.00");
});
for (const [table, code] of [["products", "product_missing"], ["product_sale_units", "presentation_missing"]]) {
  await test(code, async () => { tables[table] = []; const r = await validate(pending()); assert.equal(r.status, "blocked"); assert.ok(has(r, code)); assert.equal(r.totals.current, null); });
}
for (const [table, code] of [["products", "product_inactive"], ["product_sale_units", "presentation_inactive"]]) {
  await test(code, async () => { tables[table][0].active = false; const r = await validate(pending()); assert.ok(has(r, code)); assert.equal(r.status, "blocked"); });
}
await test("factor and unit changes block without repricing or multiplying by factor", async () => {
  tables.product_sale_units[0].quantity_in_base_unit = 12; tables.products[0].unit = "kg";
  const r = await validate(pending()); assert.ok(has(r, "factor_difference")); assert.ok(has(r, "unit_difference")); assert.equal(r.status, "blocked"); assert.equal(r.totals.current, "20.00");
});
await test("name changes preserve snapshot and show current commercial name", async () => {
  tables.products[0].name = "Martillo nuevo";
  const r = await validate(pending()); assert.ok(has(r, "name_difference")); assert.equal(r.lines[0].offline.name, "Martillo"); assert.equal(r.lines[0].current.name, "Martillo nuevo");
});
await test("fractional quantity and decimal half-up per line, repeated rows retain positions", async () => {
  const doc = pending(); doc.payload.lines[0].quantity = 0.5; doc.payload.lines[0].price = 0.01;
  doc.payload.lines.push({ ...doc.payload.lines[0] }); doc.payload.total = 0.01;
  tables.product_sale_units[0].sale_price = "0.01";
  const r = await validate(doc); assert.equal(r.lines.length, 2); assert.equal(r.lines[1].position, 2);
  assert.equal(r.totals.current, "0.02"); assert.equal(r.totals.roundedOfflineLines, "0.02"); assert.ok(has(r, "rounding_difference"));
  assert.equal(calls.filter((c) => c.table === "products").length, 1);
});
await test("three products remain in non-alphabetical order", async () => {
  const doc = pending();
  for (const [n, name] of [[6, "Tornillos"], [7, "Pinza"]]) {
    tables.products.push({ ...tables.products[0], id: id(n), name });
    tables.product_sale_units.push({ ...tables.product_sale_units[0], id: id(n + 10), product_id: id(n) });
    doc.payload.lines.push({ ...doc.payload.lines[0], id: id(n), name, selectedSaleUnitId: id(n + 10) });
  }
  doc.payload.total = 60;
  const r = await validate(doc); assert.equal(r.lines.map((l) => l.current.name).join(","), "Martillo,Tornillos,Pinza");
});
await test("same product in different presentations is not merged", async () => {
  tables.product_sale_units.push({ ...tables.product_sale_units[0], id: id(8), name: "Caja", is_default: false, quantity_in_base_unit: 10, sale_price: 50 });
  const doc = pending(); doc.payload.lines.push({ ...doc.payload.lines[0], selectedSaleUnitId: id(8), selectedSaleUnitName: "Caja", quantityInBaseUnit: 10, price: 50 }); doc.payload.total = 120;
  const r = await validate(doc); assert.equal(r.status, "no_differences"); assert.equal(r.lines.length, 2); assert.equal(r.totals.current, "120.00");
});
for (const field of ["tenant_id", "user_id"]) await test(`reject foreign ${field} before catalog reads`, async () => {
  const doc = pending(); doc[field] = id(99); const r = await validate(doc);
  assert.equal(r.status, "unauthorized"); assert.ok(!calls.some((c) => c.table === "products"));
});
await test("no session", async () => { user = null; assert.equal((await validate(pending())).status, "unauthorized"); assert.equal(calls.length, 0); });
for (const role of ["viewer", "cashier", "unknown"]) await test(`role ${role} rejected`, async () => {
  tables.tenant_members[0].role = role; assert.equal((await validate(pending())).status, "unauthorized");
});
await test("inactive membership, missing tenant and multiple tenants fail closed", async () => {
  tables.tenant_members[0].active = false; assert.equal((await validate(pending())).status, "unauthorized");
  reset(); tables.tenants = []; assert.equal((await validate(pending())).status, "unauthorized");
  reset(); tables.tenant_members.push({ ...tables.tenant_members[0], tenant_id: id(99) }); assert.equal((await validate(pending())).status, "unauthorized");
});
await test("foreign product, presentation and customer cannot cross tenant filters", async () => {
  tables.products[0].tenant_id = id(99); assert.ok(has(await validate(pending()), "product_missing"));
  reset(); tables.product_sale_units[0].tenant_id = id(99); assert.ok(has(await validate(pending()), "presentation_missing"));
  reset(); const doc = pending(); doc.payload.customer.id = id(20);
  tables.customers.push({ id: id(20), tenant_id: id(99), deleted_at: null }); assert.ok(has(await validate(doc), "customer_missing"));
  tables.customers[0].tenant_id = tenant; assert.equal((await validate(doc)).status, "no_differences");
  tables.customers[0].deleted_at = "2026-01-01"; assert.ok(has(await validate(doc), "customer_missing"));
});
await test("network and query failures return unavailable, never no_differences", async () => {
  failAuth = true; assert.equal((await validate(pending())).status, "verification_unavailable");
  failAuth = false;
  for (const table of ["tenant_members", "tenants", "products", "product_sale_units", "customers"]) {
    failTable = table; const doc = pending(); if (table === "customers") doc.payload.customer.id = id(20);
    assert.equal((await validate(doc)).status, "verification_unavailable");
  }
});
await test("missing price differs from explicit zero", async () => {
  tables.product_sale_units[0].sale_price = null; assert.ok(has(await validate(pending()), "price_missing"));
  tables.product_sale_units[0].sale_price = 0; const r = await validate(pending()); assert.equal(r.totals.current, "0.00"); assert.ok(!has(r, "price_missing"));
});
await test("legacy empty unit resolves default visibly; no default uses base price", async () => {
  const doc = pending(); doc.payload.lines[0].selectedSaleUnitId = ""; doc.payload.customer.id = "";
  assert.ok(has(await validate(doc), "presentation_difference"));
  tables.product_sale_units = []; const r = await validate(doc); assert.equal(r.status, "no_differences"); assert.equal(r.totals.current, "20.00");
  tables.products[0].sale_price = null; assert.ok(has(await validate(doc), "price_missing"));
});
await test("ambiguous defaults block; missing explicit ID is never replaced", async () => {
  tables.product_sale_units.push({ ...tables.product_sale_units[0], id: id(9) });
  const doc = pending(); doc.payload.lines[0].selectedSaleUnitId = null;
  assert.ok(has(await validate(doc), "presentation_ambiguous"));
  doc.payload.lines[0].selectedSaleUnitId = id(88); assert.ok(has(await validate(doc), "presentation_missing"));
});
for (const mutate of [
  (d) => { d.id = "bad"; }, (d) => { delete d.user_id; },
  (d) => { d.payload.lines[0].quantity = 1.0001; }, (d) => { d.payload.lines[0].quantity = 0; },
  (d) => { d.payload.lines[0].price = 0.001; }, (d) => { d.payload.lines[0].price = -1; },
  (d) => { d.payload.lines[0].quantityInBaseUnit = 0; }, (d) => { d.payload.lines[0].price = Infinity; },
  (d) => { d.payload.discount = 1; }, (d) => { d.payload.lines[0].discount = 1; },
  (d) => { d.payload.total = 19.99; }, (d) => { d.payload.lines = []; },
]) await test(`invalid/incomplete contract ${mutate.toString()}`, async () => {
  const doc = pending(); mutate(doc); assert.equal((await validate(doc)).status, "contract_error");
});
await test("legacy binary total noise accepted without changing cents", async () => {
  const doc = pending(); doc.payload.lines[0].quantity = 3; doc.payload.lines[0].price = 0.1; doc.payload.total = 0.30000000000000004;
  tables.product_sale_units[0].sale_price = 0.1;
  const r = await validate(doc); assert.equal(r.status, "no_differences"); assert.equal(r.totals.current, "0.30");
});
await test("catalog numeric errors and subtotal overflow block", async () => {
  tables.product_sale_units[0].sale_price = "NaN"; assert.ok(has(await validate(pending()), "catalog_invalid"));
  tables.product_sale_units[0].sale_price = "999999999999.99"; assert.ok(has(await validate(pending()), "amount_out_of_range"));
});
await test("allowed roles and failed pending records remain inspectable", async () => {
  for (const role of ["owner", "admin", "seller"]) {
    tables.tenant_members[0].role = role;
    const doc = pending(); doc.status = "failed";
    assert.equal((await validate(doc)).status, "no_differences");
  }
});
await test("smallest quantity and exact numeric money boundary", async () => {
  const doc = pending(); doc.payload.lines[0].quantity = 0.001; doc.payload.total = 0.01;
  assert.equal((await validate(doc)).totals.current, "0.01");
  doc.payload.lines[0].quantity = 1; doc.payload.lines[0].price = 999999999999.99;
  doc.payload.total = 999999999999.99; tables.product_sale_units[0].sale_price = "999999999999.99";
  assert.equal((await validate(doc)).status, "no_differences");
});
await test("oversized and sparse documents fail without catalog reads", async () => {
  const doc = pending(); doc.payload.lines = Array(1); doc.payload.total = 0;
  assert.equal((await validate(doc)).status, "contract_error");
  doc.payload.lines = Array(1001).fill(pending().payload.lines[0]); doc.payload.total = 20020;
  assert.equal((await validate(doc)).status, "contract_error");
  assert.ok(!calls.some((c) => c.table === "products"));
});
await test("JSON-serializable result and all commercial reads scoped by tenant", async () => {
  const doc = pending(); doc.payload.customer.id = id(20);
  const r = await validate(doc); assert.doesNotThrow(() => JSON.stringify(r));
  for (const call of calls.filter((c) => ["products", "product_sale_units", "customers"].includes(c.table))) {
    assert.ok(call.filters.some(([k, v]) => k === "tenant_id" && v === tenant));
  }
});
await test("server-only boundaries and no write/public-action dependencies", async () => {
  for (const path of ["src/lib/offline/quote-commercial-core.ts", "src/lib/offline/validate-quote-commercial.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /["']use server["']|["']use client["']|\.rpc\(|\.(insert|update|upsert|delete)\(|syncSelectedSaleUnitPrices|indexedDB/);
  }
});
console.log(`${passed} isolated B.3A tests passed. No SQL or remote operations executed.`);
