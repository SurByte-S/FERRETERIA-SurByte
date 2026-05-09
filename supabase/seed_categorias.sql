-- Categorias iniciales sugeridas para una ferreteria.
-- Reemplazar TENANT_UUID por el UUID del tenant creado.

insert into public.categories (tenant_id, name, icon, sort_order) values
  ('TENANT_UUID', 'Plomeria agua', 'agua', 10),
  ('TENANT_UUID', 'Gas', 'gas', 20),
  ('TENANT_UUID', 'Electricidad', 'electricidad', 30),
  ('TENANT_UUID', 'Iluminacion', 'iluminacion', 40),
  ('TENANT_UUID', 'Herramientas', 'herramientas', 50),
  ('TENANT_UUID', 'Sanitarios y bano', 'sanitarios', 60),
  ('TENANT_UUID', 'Griferia', 'griferia', 70),
  ('TENANT_UUID', 'Pintura y adhesivos', 'pintura', 80),
  ('TENANT_UUID', 'Cocina y bachas', 'cocina', 90),
  ('TENANT_UUID', 'Riego', 'riego', 100),
  ('TENANT_UUID', 'Construccion', 'construccion', 110),
  ('TENANT_UUID', 'Ferreteria general', 'general', 120)
on conflict (tenant_id, name) do nothing;
