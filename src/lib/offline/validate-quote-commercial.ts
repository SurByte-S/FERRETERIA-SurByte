import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  CommercialContractError, compareCommercialDocument, parseCommercialDocument,
  type Product, type SaleUnit,
} from "./quote-commercial-core";

const source = "validateOfflineQuoteCommercial";
type Failure = { status: "contract_error" | "unauthorized" | "verification_unavailable"; canCreate: false };
export type OfflineQuoteCommercialResult = ReturnType<typeof compareCommercialDocument> | Failure;

// Internal DAL only: no HTTP route, Server Action, approval, RPC or queue write.
// Caller-supplied owner/tenant are assertions to CHECK, never authentication.
// Like requireTenant, fail closed when there is more than one active membership.
export async function validateOfflineQuoteCommercial(input: unknown): Promise<OfflineQuoteCommercialResult> {
  try {
    const user = await getCurrentUser(source, { distinguishVerificationErrors: true });
    if (!user) return { status: "unauthorized", canCreate: false };
    const db = getSupabaseServerClient(source);
    const memberships = await db.from("tenant_members").select("tenant_id,role")
      .eq("user_id", user.id).eq("active", true);
    if (memberships.error) throw new Error("Membership read unavailable");
    if (memberships.data?.length !== 1 || !["owner", "admin", "seller"].includes(memberships.data[0].role)) {
      return { status: "unauthorized", canCreate: false };
    }
    const tenantId = memberships.data[0].tenant_id as string;
    const tenant = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (tenant.error) throw new Error("Tenant read unavailable");
    if (!tenant.data) return { status: "unauthorized", canCreate: false };
    const document = parseCommercialDocument(input);
    if (document.ownerId !== user.id.toLowerCase() || document.tenantId !== tenantId.toLowerCase()) {
      return { status: "unauthorized", canCreate: false };
    }

    // Point lookups avoid silent PostgREST row-limit truncation. Repeated lines
    // reuse reads but are NEVER merged in the comparison or result.
    const products: Product[] = [];
    for (const productId of new Set(document.lines.map((l) => l.productId))) {
      const result = await db.from("products").select("id,tenant_id,name,unit,active,sale_price")
        .eq("tenant_id", tenantId).eq("id", productId).maybeSingle();
      if (result.error) throw new Error("Product read unavailable");
      if (result.data) products.push(result.data as Product);
    }
    const units: SaleUnit[] = [];
    const seen = new Set<string>();
    for (const line of document.lines) {
      const key = `${line.productId}:${line.saleUnitId ?? "default"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let query = db.from("product_sale_units")
        .select("id,tenant_id,product_id,name,active,is_default,quantity_in_base_unit,sale_price")
        .eq("tenant_id", tenantId).eq("product_id", line.productId);
      query = line.saleUnitId ? query.eq("id", line.saleUnitId) : query.eq("active", true).eq("is_default", true);
      const result = await query.limit(2);
      if (result.error) throw new Error("Presentation read unavailable");
      for (const unit of result.data ?? []) {
        if (!units.some((u) => u.id === unit.id)) units.push(unit as SaleUnit);
      }
    }
    let customerExists = true;
    if (document.customer.id) {
      const customer = await db.from("customers").select("id")
        .eq("tenant_id", tenantId).eq("id", document.customer.id).is("deleted_at", null).maybeSingle();
      if (customer.error) throw new Error("Customer read unavailable");
      customerExists = !!customer.data;
    }
    return compareCommercialDocument(document, products, units, customerExists);
  } catch (error) {
    return { status: error instanceof CommercialContractError ? "contract_error" : "verification_unavailable", canCreate: false };
  }
}
