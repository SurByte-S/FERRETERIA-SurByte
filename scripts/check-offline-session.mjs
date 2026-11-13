// Isolated tests: no browser profile, network, credentials or real IndexedDB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const cache = new Map();
const platform = { indexedDB: undefined };
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  const context = {
    exports, console, Date, Set, Map, Error, Number, Promise,
    get indexedDB() { return platform.indexedDB; },
    require: (name) => load(resolve(dirname(file), `${name}.ts`)),
  };
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, context, { filename: file });
  cache.set(file, exports);
  return exports;
}
const { OfflineSession, SessionRejected, attachOfflineSession } = load("src/lib/offline/offline-session.ts");
const queue = load("src/lib/offline/offline-queue-store.ts");
const { readSessionMarker } = load("src/lib/auth/session-marker.ts");
const scope = { userId: "11111111-1111-1111-1111-111111111111", tenantId: "22222222-2222-2222-2222-222222222222", role: "seller", marker: "epoch-a" };
let marker = scope.marker;
let online = true;
let now = 1000;
let verified = { ...scope, validUntil: 100000 };
let verify = async () => verified;
const create = () => new OfflineSession(scope, {
  marker: () => marker, online: () => online, now: () => now, verify: () => verify(),
});
const reset = () => {
  marker = scope.marker; online = true; now = 1000;
  verified = { ...scope, validUntil: 100000 }; verify = async () => verified;
};
let passed = 0;
async function test(name, run) {
  reset(); await run(); passed++; console.log(`OK ${name}`);
}

await test("two tabs accept the same verified user; scope mismatch is rejected", async () => {
  const a = create(), b = create(); await a.verify(); await b.verify();
  a.capture(scope.tenantId, scope.userId)(); b.capture(scope.tenantId, scope.userId)();
  assert.throws(() => a.capture(scope.userId, scope.userId));
});
await test("logout invalidates both tabs without receiving any event", async () => {
  const a = create(), b = create(); await a.verify(); await b.verify();
  const pending = b.capture(scope.tenantId, scope.userId);
  marker = "logout-tombstone";
  assert.equal(a.check(), false); assert.throws(pending);
  assert.equal(b.snapshot(), "invalid");
  await b.verify(); assert.equal(b.snapshot(), "invalid");
});
for (const [field, value] of [["userId", "other-user"], ["tenantId", "other-tenant"], ["role", "viewer"]]) {
  await test(`server detects changed ${field} even without a cookie event`, async () => {
    const session = create(); await session.verify();
    verified = { ...verified, [field]: value }; await session.verify();
    assert.equal(session.snapshot(), "invalid");
  });
}
await test("late verification cannot restore a logged-out session", async () => {
  let finish; verify = () => new Promise((resolve) => { finish = resolve; });
  const session = create(); const checking = session.verify();
  marker = "other-login"; session.check(); finish(verified); await checking;
  assert.equal(session.snapshot(), "invalid");
});
await test("offline use requires previous verification and stops at expiry", async () => {
  online = false; const fresh = create(); await fresh.verify();
  assert.throws(() => fresh.capture(scope.tenantId, scope.userId));
  online = true; const session = create(); await session.verify();
  online = false; session.capture(scope.tenantId, scope.userId)();
  now = verified.validUntil; assert.throws(() => session.capture(scope.tenantId, scope.userId));
});
await test("reconnection blocks old access until server verification; failures stay blocked", async () => {
  const session = create(); await session.verify();
  online = false; session.check(); online = true;
  assert.throws(() => session.capture(scope.tenantId, scope.userId));
  verify = async () => { throw new Error("unavailable"); };
  await session.verify(); assert.equal(session.snapshot(), "blocked");
  online = false; assert.throws(() => session.capture(scope.tenantId, scope.userId));
  online = true; verify = async () => verified;
  await session.verify(); session.capture(scope.tenantId, scope.userId)();
});
await test("server rejection invalidates instead of redirecting or retrying indefinitely", async () => {
  const session = create(); await session.verify();
  verify = async () => { throw new SessionRejected(); };
  await session.verify(); assert.equal(session.snapshot(), "invalid");
});
await test("invalidated session cannot open IndexedDB", async () => {
  const session = create(); await session.verify(); const detach = attachOfflineSession(session);
  let opens = 0; platform.indexedDB = { open: () => { opens++; throw new Error("unexpected open"); } };
  marker = "logout";
  await assert.rejects(queue.listOfflineQueueItems(scope.tenantId, scope.userId));
  assert.equal(opens, 0); detach();
});
await test("late IndexedDB result is rejected and existing records remain untouched", async () => {
  const session = create(); await session.verify(); const detach = attachOfflineSession(session);
  const records = [{ id: "stored", tenant_id: scope.tenantId, user_id: scope.userId, status: "pending", created_at: "2026-01-01" }];
  const before = JSON.stringify(records);
  let finishRead;
  let opened;
  const openedPromise = new Promise((resolve) => { opened = resolve; });
  platform.indexedDB = {
    open: () => {
      const request = {};
      const tx = new EventTarget();
      tx.abort = () => { throw new Error("Unexpected abort: simulate a missed event"); };
      tx.objectStore = () => ({ index: () => ({ getAll: () => {
        const read = { result: records };
        finishRead = async () => {
          read.onsuccess();
          await new Promise(setImmediate);
          tx.dispatchEvent(new Event("complete")); tx.oncomplete();
        };
        opened(); return read;
      } }) });
      request.result = { transaction: () => tx, close: () => {} };
      queueMicrotask(() => request.onsuccess()); return request;
    },
  };
  const reading = queue.listOfflineQueueItems(scope.tenantId, scope.userId);
  const rejection = assert.rejects(reading);
  await openedPromise;
  marker = "logout"; // No broadcast or timer; final read checkpoint detects it.
  await finishRead(); await rejection;
  assert.equal(JSON.stringify(records), before); detach();
});
await test("public marker parsing contains no identity and supports legacy sessions", async () => {
  assert.equal(readSessionMarker("unrelated=1"), null);
  assert.equal(readSessionMarker("x=1; ferreteria_sb_session_marker=random; y=2"), "random");
  marker = null; const session = new OfflineSession({ ...scope, marker: null }, {
    marker: () => marker, online: () => true, now: () => now,
    verify: async () => ({ ...verified, marker: null }),
  });
  await session.verify(); assert.equal(session.snapshot(), "ready");
  marker = "logout-tombstone"; assert.equal(session.check(), false);
});
function mockedModule(path, dependencies, extras = {}) {
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(compiled.outputText, {
    exports, Response, Date, Buffer, ...extras,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}
await test("login and both centralized logout callers rotate a public marker, retaining HttpOnly credentials", async () => {
  const jar = new Map(); let serial = 0;
  const auth = mockedModule("src/lib/auth/session.ts", {
    "next/headers": { cookies: async () => ({
      set: (key, value, options) => jar.set(key, { value, options }),
      delete: (key) => jar.delete(key), get: (key) => jar.get(key),
    }) },
    "next/navigation": {}, "@supabase/supabase-js": {},
    "@/lib/server-log": {}, "@/lib/supabase/env": {},
    "./session-marker": load("src/lib/auth/session-marker.ts"),
  }, { crypto: { randomUUID: () => `random-${++serial}` }, process: { env: { NODE_ENV: "production" } } });
  await auth.setAuthCookies({ accessToken: "secret-access", refreshToken: "secret-refresh", expiresIn: 3600 });
  assert.equal(jar.get("ferreteria_sb_access_token").options.httpOnly, true);
  assert.equal(jar.get("ferreteria_sb_refresh_token").options.httpOnly, true);
  assert.equal(await auth.getSessionMarker(), "random-1");
  await auth.clearAuthCookies();
  assert.equal(jar.has("ferreteria_sb_access_token"), false);
  assert.equal(await auth.getSessionMarker(), "random-2");
  await auth.setAuthCookies({ accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 3600 });
  assert.equal(await auth.getSessionMarker(), "random-3");
  assert.equal(jar.get("ferreteria_sb_session_marker").options.httpOnly, false);
});
for (const scenario of ["valid", "no-user", "no-membership", "multiple", "db-error", "expired"]) {
  await test(`read-only identity endpoint: ${scenario}`, async () => {
    const filters = [];
    const members = scenario === "no-membership" ? [] : [{ tenant_id: scope.tenantId, role: scope.role }];
    if (scenario === "multiple") members.push({ tenant_id: "other", role: "seller" });
    const builder = {
      select: () => builder,
      eq: (key, value) => { filters.push([key, value]); return builder; },
      then: (resolve) => resolve({ data: members, error: scenario === "db-error" ? new Error("unavailable") : null }),
    };
    const route = mockedModule("src/app/api/auth/session-context/route.ts", {
      "@/lib/auth/session": {
        getCurrentUser: async () => scenario === "no-user" ? null : { id: scope.userId },
        getSessionExpiresAt: async () => scenario === "expired" ? 0 : Date.now() + 60000,
        getSessionMarker: async () => scope.marker,
      },
      "@/lib/supabase": { getSupabaseServerClient: () => ({ from: (table) => {
        assert.equal(table, "tenant_members"); return builder;
      } }) },
    });
    const response = await route.GET();
    const expected = { valid: 200, "no-user": 401, "no-membership": 403, multiple: 403, "db-error": 503, expired: 401 };
    assert.equal(response.status, expected[scenario]);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("location"), null);
    if (scenario !== "no-user") assert.deepEqual(filters, [["user_id", scope.userId], ["active", true]]);
    if (scenario === "valid") {
      const body = await response.json();
      assert.equal(body.userId, scope.userId); assert.equal(body.tenantId, scope.tenantId);
      assert.ok(body.validUntil > Date.now() && body.validUntil <= Date.now() + 60000);
    }
  });
}
console.log(`${passed} isolated tests passed. No real IndexedDB or Supabase accessed.`);
