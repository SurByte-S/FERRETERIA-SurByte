import { requireConfigurationTenant } from "../access";
import {
  PersonalizacionForm,
  type ColorMode,
  type FontPreset,
  type TenantUiSettingsConfig,
  type ThemePreset,
} from "../configuracion-forms";
import { PageHeader } from "@/components/shell/page-header";
import { getSupabaseServerClient } from "@/lib/supabase";

type TenantUiSettingsRow = {
  color_mode: string | null;
  font_preset: string | null;
  theme_preset: string | null;
};

const defaultUiSettings: TenantUiSettingsConfig = {
  color_mode: "claro",
  font_preset: "sistema",
  theme_preset: "azul_clasico",
};

const themePresets = ["azul_clasico", "verde_comercio", "gris_sobrio"] as const;
const fontPresets = ["sistema", "legible", "compacta"] as const;
const colorModes = ["claro", "oscuro"] as const;

export default async function ConfiguracionPersonalizacionPage() {
  const tenant = await requireConfigurationTenant(
    "/configuracion/personalizacion"
  );
  const settings = await loadTenantUiSettings(tenant.id);

  return (
    <>
      <PageHeader
        title="Personalizacion"
        description="Elegi como se ven los colores y la letra del sistema."
        eyebrow=""
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="grid max-w-5xl gap-4 pb-6">
        <PersonalizacionForm settings={settings} />
      </div>
    </>
  );
}

async function loadTenantUiSettings(
  tenantId: string
): Promise<TenantUiSettingsConfig> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("tenant_ui_settings")
      .select("theme_preset,font_preset,color_mode")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error || !data) {
      return defaultUiSettings;
    }

    const row = data as TenantUiSettingsRow;

    return {
      color_mode: parseColorMode(row.color_mode),
      font_preset: parseFontPreset(row.font_preset),
      theme_preset: parseThemePreset(row.theme_preset),
    };
  } catch {
    return defaultUiSettings;
  }
}

function parseThemePreset(value: string | null | undefined): ThemePreset {
  return themePresets.some((item) => item === value)
    ? (value as ThemePreset)
    : defaultUiSettings.theme_preset;
}

function parseFontPreset(value: string | null | undefined): FontPreset {
  return fontPresets.some((item) => item === value)
    ? (value as FontPreset)
    : defaultUiSettings.font_preset;
}

function parseColorMode(value: string | null | undefined): ColorMode {
  return colorModes.some((item) => item === value)
    ? (value as ColorMode)
    : defaultUiSettings.color_mode;
}
