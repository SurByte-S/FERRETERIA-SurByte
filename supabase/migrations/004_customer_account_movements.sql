create table if not exists public.customer_account_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  movement_type text not null check (movement_type in ('debit', 'payment', 'adjustment')),
  amount numeric(14,2) not null check (amount >= 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_account_movements_tenant_customer_created
  on public.customer_account_movements (tenant_id, customer_id, created_at desc);

create index if not exists idx_customer_account_movements_tenant_created
  on public.customer_account_movements (tenant_id, created_at desc);

create index if not exists idx_customer_account_movements_sale
  on public.customer_account_movements (sale_id);

alter table public.customer_account_movements enable row level security;

drop policy if exists "members read customer account movements" on public.customer_account_movements;
create policy "members read customer account movements"
  on public.customer_account_movements
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "seller creates customer account movements" on public.customer_account_movements;
create policy "seller creates customer account movements"
  on public.customer_account_movements
  for insert
  to authenticated
  with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create or replace view public.customer_account_balances
with (security_invoker = true) as
select
  c.tenant_id,
  c.id as customer_id,
  coalesce(
    sum(
      case
        when m.movement_type = 'debit' then m.amount
        when m.movement_type = 'payment' then -m.amount
        when m.movement_type = 'adjustment' then m.amount
        else 0
      end
    ),
    0
  )::numeric(14,2) as balance
from public.customers c
left join public.customer_account_movements m
  on m.tenant_id = c.tenant_id
  and m.customer_id = c.id
group by c.tenant_id, c.id;

grant select on public.customer_account_balances to authenticated;
grant select on public.customer_account_balances to service_role;
