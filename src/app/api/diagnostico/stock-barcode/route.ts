import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

function publicSupabaseHost() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(rawUrl).host;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin"], "stockBarcodeDiagnostics"),
      requireUser("stockBarcodeDiagnostics"),
    ]);
    const supabase = getSupabaseServerClient("stockBarcodeDiagnostics");
    const { data, error } = await supabase.rpc("stock_barcode_diagnostics", {
      input_tenant_id: tenant.id,
      input_user_id: user.id,
    });

    if (error) {
      return Response.json(
        {
          ok: false,
          message: error.message.includes("Could not find the function")
            ? "Falta aplicar la migracion 021 de diagnostico stock-barcode."
            : "No se pudo generar el diagnostico.",
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        role: tenant.role,
      },
      supabase: {
        host: publicSupabaseHost(),
      },
      diagnostics: data,
    });
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return Response.json(
        { ok: false, message: FORBIDDEN_ACTION_MESSAGE },
        { status: 403 }
      );
    }

    return Response.json(
      { ok: false, message: "No se pudo generar el diagnostico." },
      { status: 500 }
    );
  }
}
