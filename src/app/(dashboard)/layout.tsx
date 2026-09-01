import { connection } from "next/server";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type TenantBrandRow = {
  business_name: string | null;
  logo_url: string | null;
  name: string | null;
};

type TenantAppearance = {
  colorMode: "claro" | "oscuro";
  fontPreset: "sistema" | "legible" | "compacta";
  themePreset: "azul_clasico" | "verde_comercio" | "gris_sobrio";
};

type TenantUiSettingsRow = {
  color_mode: string | null;
  font_preset: string | null;
  theme_preset: string | null;
};

const defaultTenantAppearance: TenantAppearance = {
  colorMode: "claro",
  fontPreset: "sistema",
  themePreset: "azul_clasico",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireUser("/dashboard-layout");
  const tenant = await requireTenant("/dashboard-layout");
  const [tenantBrand, tenantAppearance] = await Promise.all([
    loadTenantBrand({
      fallbackName: tenant.name,
      tenantId: tenant.id,
    }),
    loadTenantAppearance(tenant.id),
  ]);

  return (
    <DashboardShell
      tenantAppearance={tenantAppearance}
      tenantBrand={tenantBrand}
      tenantRole={tenant.role}
      userEmail={user.email}
    >
      {children}
    </DashboardShell>
  );
}

async function loadTenantBrand({
  fallbackName,
  tenantId,
}: {
  fallbackName: string;
  tenantId: string;
}) {
  const fallbackBrand = {
    logoUrl: null,
    name: fallbackName || ferreteriaGuemesBrand.brandName,
  };

  try {
    const supabase = getSupabaseServerClient("/dashboard-layout-brand");
    const { data, error } = await supabase
      .from("tenants")
      .select("name,business_name,logo_url")
      .eq("id", tenantId)
      .maybeSingle();

    if (error || !data) {
      return fallbackBrand;
    }

    const row = data as TenantBrandRow;
    const name =
      row.business_name?.trim() ||
      row.name?.trim() ||
      fallbackBrand.name;

    return {
      logoUrl: row.logo_url?.trim() || null,
      name,
    };
  } catch {
    return fallbackBrand;
  }
}

async function loadTenantAppearance(
  tenantId: string
): Promise<TenantAppearance> {
  try {
    const supabase = getSupabaseServerClient("/dashboard-layout-appearance");
    const { data, error } = await supabase
      .from("tenant_ui_settings")
      .select("theme_preset,font_preset,color_mode")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !data) {
      return defaultTenantAppearance;
    }

    const row = data as TenantUiSettingsRow;

    return {
      colorMode: parseColorMode(row.color_mode),
      fontPreset: parseFontPreset(row.font_preset),
      themePreset: parseThemePreset(row.theme_preset),
    };
  } catch {
    return defaultTenantAppearance;
  }
}

function parseThemePreset(value: string | null | undefined) {
  return value === "verde_comercio" || value === "gris_sobrio"
    ? value
    : defaultTenantAppearance.themePreset;
}

function parseFontPreset(value: string | null | undefined) {
  return value === "legible" || value === "compacta"
    ? value
    : defaultTenantAppearance.fontPreset;
}

function parseColorMode(value: string | null | undefined) {
  return value === "oscuro" ? value : defaultTenantAppearance.colorMode;
}
