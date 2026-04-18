-- Menu Item Ingredients (links menu items to inventory items)
-- Run this in your Supabase SQL editor

create table if not exists public.menu_item_ingredients (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id        uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id   uuid not null references public.inventory_items(id) on delete cascade,
  quantity            numeric not null default 1,
  created_at          timestamptz not null default now(),
  unique (menu_item_id, inventory_item_id)
);

alter table public.menu_item_ingredients enable row level security;

drop policy if exists "dev_menu_item_ingredients" on public.menu_item_ingredients;
create policy "dev_menu_item_ingredients"
  on public.menu_item_ingredients for all using (true) with check (true);

create index if not exists idx_menu_item_ingredients_menu_item  on public.menu_item_ingredients(menu_item_id);
create index if not exists idx_menu_item_ingredients_inv_item   on public.menu_item_ingredients(inventory_item_id);
create index if not exists idx_menu_item_ingredients_restaurant on public.menu_item_ingredients(restaurant_id);
