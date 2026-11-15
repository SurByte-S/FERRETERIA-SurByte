// Static guardrails only: this script does NOT parse/execute SQL or connect to a DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "supabase/migrations/040_offline_quote_idempotency.sql";
const raw = readFileSync(path, "utf8");
const sql = raw.replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ").trim();
let checks = 0;
function check(name, run) { run(); checks++; console.log(`OK static: ${name}`); }
function before(first, second) {
  const a = sql.indexOf(first), b = sql.indexOf(second);
  assert.ok(a >= 0 && b > a, `Expected ${first} before ${second}`);
}

check("atomic migration and dependency check", () => {
  assert.ok(sql.startsWith("begin;")); assert.ok(sql.endsWith("commit;"));
  assert.match(sql, /to_regprocedure\('public\.create_quote_with_current_product_names/);
  assert.match(sql, /perform qi\.sort_order from public\.quote_items/);
});
check("one new RPC; no commercial function replacement", () => {
  assert.equal((sql.match(/create function /g) ?? []).length, 1);
  assert.match(sql, /create function public\.confirm_offline_quote_operation\(/);
  assert.doesNotMatch(sql, /create or replace|drop function|alter function/i);
});
check("exact tenant/local UUID uniqueness and mandatory receipt fields", () => {
  assert.match(sql, /primary key \(tenant_id, local_operation_id\)/);
  for (const field of ["tenant_id uuid", "local_operation_id uuid", "owner_user_id uuid", "contract_version integer", "command_fingerprint text", "remote_quote_id uuid", "quote_number bigint", "total numeric(14,2)", "confirmed_at timestamptz"]) {
    assert.ok(sql.includes(`${field} not null`), field);
  }
});
check("receipt survives deletion; no application mutation path", () => {
  assert.doesNotMatch(sql, /references |on delete|delete from|truncate |update public\./i);
  assert.equal((sql.match(/insert into public\./g) ?? []).length, 1);
});
check("RLS and ACL deny direct access including service_role", () => {
  assert.match(sql, /alter table public\.offline_quote_operations enable row level security/);
  assert.match(sql, /revoke all on table public\.offline_quote_operations from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /create policy|grant /i);
});
check("SECURITY DEFINER safe path and no application EXECUTE", () => {
  assert.match(sql, /volatile security definer set search_path = pg_catalog, pg_temp/);
  assert.match(sql, /revoke all on function public\.confirm_offline_quote_operation\(uuid, uuid, uuid, uuid, integer, jsonb\) from public, anon, authenticated, service_role/);
});
check("actor/owner equality and locked active allowed membership", () => {
  assert.match(sql, /input_owner_user_id <> input_authenticated_user_id/);
  assert.match(sql, /tm\.tenant_id = input_tenant_id and tm\.user_id = input_authenticated_user_id and tm\.active = true/);
  assert.match(sql, /array\['owner', 'admin', 'seller'\]::public\.tenant_role\[\]/);
  assert.match(sql, /for share of tm, t/);
  before("for share of tm, t", "select op.* into receipt");
});
check("unknown keys rejected; no browser price authority", () => {
  assert.match(sql, /input_command - array\['customer', 'items', 'notes'\]/);
  assert.match(sql, /line_data - array\['product_id', 'sale_unit_id', 'quantity'\]/);
  assert.match(sql, /input_contract_version is distinct from 1/);
});
check("ordered lines and exact quantity normalization", () => {
  assert.match(sql, /with ordinality as entry\(item, position\) order by entry\.position/);
  assert.match(sql, /line_quantity <> pg_catalog\.round\(line_quantity, 3\)/);
  assert.match(sql, /'quantity', line_quantity::numeric\(14,3\)/);
  assert.doesNotMatch(sql, /row_number|group by|distinct on/i);
});
check("server SHA256 hashes the canonical command, not retry metadata", () => {
  assert.match(sql, /pg_catalog\.sha256\(pg_catalog\.convert_to\(normalized_command::text, 'UTF8'\)\)/);
  const normalized = sql.slice(sql.indexOf("normalized_command :="), sql.indexOf("fingerprint :="));
  for (const key of ["contract_version", "tenant_id", "owner_user_id", "customer", "items", "notes"]) assert.ok(normalized.includes(`'${key}'`));
  assert.doesNotMatch(normalized, /clock_timestamp|now\(|attempt|created_at|random/i);
});
check("transaction lock precedes receipt lookup and creation", () => {
  before("pg_advisory_xact_lock", "select op.* into receipt");
  before("select op.* into receipt", "created_quote_id :=");
  assert.match(sql, /'offline_quote:' \|\| input_tenant_id::text \|\| ':' \|\| input_local_operation_id::text/);
});
check("replay verifies owner and command before returning frozen result", () => {
  before("receipt.owner_user_id <> input_authenticated_user_id", "return query select receipt.local_operation_id");
  before("receipt.command_fingerprint <> fingerprint", "return query select receipt.local_operation_id");
  before("return query select receipt.local_operation_id", "OFFLINE_QUOTE_SYNC_NOT_ENABLED");
});
check("hard gate blocks creation even if EXECUTE were granted", () => {
  assert.match(sql, /end if; raise exception 'OFFLINE_QUOTE_SYNC_NOT_ENABLED' using errcode = '55000';/);
  before("raise exception 'OFFLINE_QUOTE_SYNC_NOT_ENABLED'", "created_quote_id :=");
  before("raise exception 'OFFLINE_QUOTE_SYNC_NOT_ENABLED'", "insert into public.offline_quote_operations");
  assert.doesNotMatch(sql, /current_setting|set_config/i);
});
check("delegation preserves names/order and transactional errors", () => {
  assert.match(sql, /created_quote_id := public\.create_quote_with_current_product_names\(/);
  assert.match(sql, /input_items => normalized_items/);
  assert.match(sql, /input_created_by => input_authenticated_user_id/);
  before("created_quote_id :=", "insert into public.offline_quote_operations");
  assert.doesNotMatch(sql, /exception when|syncSelectedSaleUnitPrices|public\.sale_items|public\.sales|public\.stock_movements|public\.cash_/i);
});

console.log(`${checks} static checks passed. SQL compilation, transactions and concurrency NOT executed.`);
