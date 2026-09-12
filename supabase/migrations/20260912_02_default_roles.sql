-- ============================================================
-- 20260912_02 — Formalize restaurant_roles + seed starter roles
-- ------------------------------------------------------------
-- restaurant_roles has existed live (created ad hoc in the SQL editor,
-- referenced throughout the app: src/app/api/settings/roles/route.ts,
-- src/lib/permissions/server.ts, src/app/(restaurant)/dashboard/settings/
-- users/page.tsx) but its base CREATE TABLE was never committed — same gap
-- as 20260912_01_push_subscriptions.sql. Idempotent, safe against a database
-- that already has the table.
--
-- Also backfills four starter roles (Cashier, Driver, CFD, KDS) for every
-- restaurant that doesn't already have a role by that name, so new dashboards
-- aren't starting from a completely empty Roles tab. Permission keys must
-- match src/lib/defaultRoles.ts and PERMISSION_TREE in
-- src/app/(restaurant)/dashboard/settings/users/page.tsx. New restaurants
-- going forward get these seeded at creation time (src/lib/provision.ts,
-- seedDefaultRoles) — this backfill is a one-time snapshot for existing rows.
-- ============================================================

create table if not exists public.restaurant_roles (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  permissions   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_restaurant_roles_restaurant on public.restaurant_roles(restaurant_id);

-- ── RLS (mirrors the generic tenant-table loop in 20260829_02_tenant_rls.sql,
--    restated here so this migration is self-sufficient on a fresh database
--    where restaurant_roles doesn't exist yet when that loop runs) ─────────
alter table public.restaurant_roles enable row level security;
drop policy if exists tenant_restaurant_roles on public.restaurant_roles;
create policy tenant_restaurant_roles on public.restaurant_roles for all to authenticated
  using      (restaurant_id in (select public.user_restaurant_ids()))
  with check  (restaurant_id in (select public.user_restaurant_ids()));

-- ── Backfill starter roles for existing restaurants ─────────────────────────
insert into public.restaurant_roles (restaurant_id, name, permissions)
select r.id, v.name, v.permissions::jsonb
from public.restaurants r
cross join (values
  ('Cashier', '{
     "dashboard.access": true,
     "dine_in": true,
     "dashboard.btn_new_order": true,
     "dashboard.order.send_kitchen": true,
     "dashboard.pay": true,
     "dashboard.receipt": true,
     "dashboard.discount": true,
     "dashboard.drawer": true,
     "dashboard.customer": true
   }'),
  ('Driver', '{
     "driver_screen": true,
     "manage_delivery.be_driver": true,
     "manage_delivery.departure": true
   }'),
  ('CFD', '{ "cfd": true }'),
  ('KDS', '{ "kds": true }')
) as v(name, permissions)
where not exists (
  select 1 from public.restaurant_roles rr
  where rr.restaurant_id = r.id and rr.name = v.name
);
