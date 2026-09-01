create table if not exists public.tenant_ui_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  theme_preset text not null default 'azul_clasico',
  font_preset text not null default 'sistema',
  color_mode text not null default 'claro',
  pwa_icon_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_ui_settings_theme_preset_check
    check (theme_preset in ('azul_clasico', 'verde_comercio', 'gris_sobrio')),
  constraint tenant_ui_settings_font_preset_check
    check (font_preset in ('sistema', 'legible', 'compacta')),
  constraint tenant_ui_settings_color_mode_check
    check (color_mode in ('claro', 'oscuro'))
);

drop trigger if exists trg_tenant_ui_settings_updated_at on public.tenant_ui_settings;
create trigger trg_tenant_ui_settings_updated_at
before update on public.tenant_ui_settings
for each row execute function public.set_updated_at();

alter table public.tenant_ui_settings enable row level security;

grant select, insert, update on public.tenant_ui_settings to authenticated;
grant select, insert, update on public.tenant_ui_settings to service_role;

drop policy if exists "members read tenant ui settings" on public.tenant_ui_settings;
create policy "members read tenant ui settings"
on public.tenant_ui_settings for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage tenant ui settings" on public.tenant_ui_settings;
create policy "admins manage tenant ui settings"
on public.tenant_ui_settings for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

drop policy if exists "admins update tenant ui settings" on public.tenant_ui_settings;
create policy "admins update tenant ui settings"
on public.tenant_ui_settings for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));
