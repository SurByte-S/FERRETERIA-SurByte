alter table public.products
add column if not exists profit_margin_percent numeric(8,2) not null default 0;

do $$
begin
  alter table public.products
  add constraint products_profit_margin_percent_non_negative_check
  check (profit_margin_percent >= 0) not valid;
exception
  when duplicate_object then null;
end $$;
