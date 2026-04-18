-- Inventory Schema Migration
-- Run this in your Supabase SQL editor

-- Categories table
create table if not exists public.inventory_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  color         text not null default '#10b981',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.inventory_categories enable row level security;

drop policy if exists "restaurant_owner_inventory_categories" on public.inventory_categories;
drop policy if exists "dev_inventory_categories" on public.inventory_categories;
create policy "dev_inventory_categories"
  on public.inventory_categories for all using (true) with check (true);

-- Units table
create table if not exists public.inventory_units (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  abbreviation  text not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.inventory_units enable row level security;

drop policy if exists "restaurant_owner_inventory_units" on public.inventory_units;
drop policy if exists "dev_inventory_units" on public.inventory_units;
create policy "dev_inventory_units"
  on public.inventory_units for all using (true) with check (true);

-- Items table  (column names match the TypeScript InvItem interface)
create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid references public.inventory_categories(id) on delete set null,
  unit_id       uuid references public.inventory_units(id) on delete set null,
  name          text not null,
  sku           text,
  current_stock numeric not null default 0,
  min_stock     numeric not null default 0,
  cost_price    numeric not null default 0,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

drop policy if exists "restaurant_owner_inventory_items" on public.inventory_items;
drop policy if exists "dev_inventory_items" on public.inventory_items;
create policy "dev_inventory_items"
  on public.inventory_items for all using (true) with check (true);

-- Auto-update updated_at trigger (shared function)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_categories_updated_at on public.inventory_categories;
create trigger inventory_categories_updated_at
  before update on public.inventory_categories
  for each row execute function public.set_updated_at();

drop trigger if exists inventory_units_updated_at on public.inventory_units;
create trigger inventory_units_updated_at
  before update on public.inventory_units
  for each row execute function public.set_updated_at();

drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- Performance indexes
create index if not exists idx_inventory_items_restaurant      on public.inventory_items(restaurant_id);
create index if not exists idx_inventory_items_category        on public.inventory_items(category_id);
create index if not exists idx_inventory_categories_restaurant on public.inventory_categories(restaurant_id);
create index if not exists idx_inventory_units_restaurant      on public.inventory_units(restaurant_id);
