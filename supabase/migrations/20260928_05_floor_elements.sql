-- ============================================================
-- 20260928_05 — Dashboard floor plan: walls, doors & decor
-- ------------------------------------------------------------
-- Non-table items drawn on the floor plan (20260928_04): planters,
-- partitions, pillars, walls, doors, windows, kitchen pass, POS station,
-- restroom. One row per item; x/y/w/h are px on the floor canvas, same
-- space as tables.pos_x/pos_y. group_id is the table group (area) the item
-- belongs to — NULL for restaurants that have no groups.
--
-- `kind` is deliberately not CHECK-constrained: the dashboard ignores kinds
-- it doesn't know, so new kinds ship without a migration.
--
-- Additive. Until it runs, the dashboard shows plans without these items
-- and saving one reports an error.
-- ============================================================

create table if not exists public.floor_elements (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id      uuid references public.table_groups(id) on delete cascade,
  kind          text not null,
  x             real not null default 0,
  y             real not null default 0,
  w             real not null default 60,
  h             real not null default 60,
  created_at    timestamptz not null default now()
);

create index if not exists idx_floor_elements_restaurant on public.floor_elements(restaurant_id);

-- ── RLS — staff of the restaurant only, same as tables ──────────────────
alter table public.floor_elements enable row level security;

drop policy if exists "tenant_floor_elements" on public.floor_elements;
create policy "tenant_floor_elements" on public.floor_elements for all to authenticated
  using      (restaurant_id in (select public.user_restaurant_ids()))
  with check  (restaurant_id in (select public.user_restaurant_ids()));

grant select, insert, update, delete on public.floor_elements to authenticated;

notify pgrst, 'reload schema';
