import { getCurrentUser, getSessionExpiresAt, getSessionMarker } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } });
}

// Read only. No redirects, cookie refresh, SQL writes or automatic login.
export async function GET() {
  try {
    const user = await getCurrentUser("/api/auth/session-context");
    if (!user) return json({ ok: false }, 401);
    const { data, error } = await getSupabaseServerClient("/api/auth/session-context")
      .from("tenant_members").select("tenant_id,role")
      .eq("user_id", user.id).eq("active", true);
    if (error) return json({ ok: false }, 503);
    if (!data || data.length !== 1) return json({ ok: false }, 403);
    const expiresAt = await getSessionExpiresAt();
    if (expiresAt <= Date.now()) return json({ ok: false }, 401);
    return json({
      userId: user.id, tenantId: data[0].tenant_id, role: data[0].role,
      marker: await getSessionMarker(),
      // Conservative permission for an already-open tab, NOT offline auth.
      validUntil: Math.min(expiresAt, Date.now() + 5 * 60_000),
    });
  } catch {
    return json({ ok: false }, 503);
  }
}
