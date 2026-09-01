alter table public.tenant_ui_settings
  drop constraint if exists tenant_ui_settings_theme_preset_check;

alter table public.tenant_ui_settings
  add constraint tenant_ui_settings_theme_preset_check
  check (
    theme_preset in (
      'azul_clasico',
      'verde_comercio',
      'gris_sobrio',
      'rojo_ferreteria',
      'naranja_calido',
      'violeta_moderno'
    )
  );
