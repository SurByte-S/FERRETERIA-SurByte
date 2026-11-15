"use server";

import { validateOfflineQuoteCommercial, type OfflineQuoteCommercialResult } from "@/lib/offline/validate-quote-commercial";

// Read-only public action. Bounds also apply to direct/forged action requests.
// B.3A still verifies the real session, membership, owner and tenant on every call.
export async function reviewOfflineQuoteAction(serialized: string): Promise<OfflineQuoteCommercialResult> {
  try {
    if (typeof serialized !== "string" || serialized.length > 128_000) {
      return { status: "contract_error", canCreate: false };
    }
    let input;
    try { input = JSON.parse(serialized); } catch {
      return { status: "contract_error", canCreate: false };
    }
    const lines: unknown = input?.payload?.lines;
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
      return { status: "contract_error", canCreate: false };
    }
    // At most 20 distinct presentation lookups + 20 products + identity/customer.
    // Repeated lines remain separate in the comparison and use shared reads.
    const lookups = new Set<string>();
    for (const line of lines) {
      if (!line || typeof line.id !== "string" ||
          !(line.selectedSaleUnitId === null || typeof line.selectedSaleUnitId === "string")) {
        return { status: "contract_error", canCreate: false };
      }
      lookups.add(`${line.id}:${line.selectedSaleUnitId || "default"}`);
    }
    if (lookups.size > 20) return { status: "contract_error", canCreate: false };
    return await validateOfflineQuoteCommercial(input);
  } catch {
    return { status: "verification_unavailable", canCreate: false };
  }
}
