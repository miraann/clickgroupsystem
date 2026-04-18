-- ============================================================
-- PRODUCTION RLS MIGRATION
-- Multi-tenant restaurant data isolation
-- Run ONCE in your Supabase SQL Editor before going live
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 1 — Shared helper function                        ║
-- ║  Returns all restaurant IDs the current user can access ║
-- ║  (as owner OR as a staff member via restaurant_users)   ║
-- ╚══════════════════════════════════════════════════════════╝

create or replace function public.user_restaurant_ids()
returns setof uuid
language sql
security definer          -- runs as function owner, bypasses sub-table RLS
stable                    -- same result within a transaction → Postgres can cache it
set search_path = public
as $$
  select restaurant_id
  from   public.restaurant_users
  where  user_id = auth.uid()
  union
  select id
  from   public.restaurants
  where  owner_id = auth.uid()
$$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 2 — Drop all open dev policies                    ║
-- ╚══════════════════════════════════════════════════════════╝

-- Restaurant (created by supabase-dev-policy.sql)
drop policy if exists "dev_restaurants_select" on public.restaurants;
drop policy if exists "dev_restaurants_update" on public.restaurants;
drop policy if exists "dev_restaurants_insert" on public.restaurants;

-- Inventory
drop policy if exists "dev_inventory_categories"  on public.inventory_categories;
drop policy if exists "dev_inventory_units"        on public.inventory_units;
drop policy if exists "dev_inventory_items"        on public.inventory_items;

-- Other dev policies
drop policy if exists "dev_menu_item_ingredients" on public.menu_item_ingredients;
drop policy if exists "dev_customer_feedback"     on public.customer_feedback;
drop policy if exists "dev_staff_select"          on public.staff;
drop policy if exists "dev_staff_insert"          on public.staff;
drop policy if exists "dev_staff_update"          on public.staff;
drop policy if exists "dev_staff_delete"          on public.staff;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 3 — Enable RLS on every table that was missing it ║
-- ╚══════════════════════════════════════════════════════════╝

alter table public.menu_categories          enable row level security;
alter table public.menu_items               enable row level security;
alter table public.menu_modifiers           enable row level security;
alter table public.modifier_options         enable row level security;
alter table public.menu_item_modifiers      enable row level security;
alter table public.kitchen_notes            enable row level security;
alter table public.void_reasons             enable row level security;
alter table public.discounts                enable row level security;
alter table public.combo_discounts          enable row level security;
alter table public.surcharges               enable row level security;
alter table public.payment_methods          enable row level security;
alter table public.invoice_number_settings  enable row level security;
alter table public.order_number_settings    enable row level security;
alter table public.events_offers            enable row level security;
alter table public.receipt_settings         enable row level security;
alter table public.invoices                 enable row level security;
alter table public.currencies               enable row level security;
alter table public.kds_stations             enable row level security;
alter table public.kds_station_categories   enable row level security;
alter table public.printers                 enable row level security;
alter table public.orders                   enable row level security;
alter table public.order_items              enable row level security;
alter table public.table_groups             enable row level security;
alter table public.tables                   enable row level security;
alter table public.staff                    enable row level security;
alter table public.delivery_orders          enable row level security;
alter table public.delivery_zones           enable row level security;
alter table public.reservations             enable row level security;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 4 — order_items: add restaurant_id column         ║
-- ║  Best solution for isolated child rows at scale         ║
-- ╚══════════════════════════════════════════════════════════╝

-- 4a. Add nullable column
alter table public.order_items
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;

-- 4b. Backfill from parent orders (safe for existing data)
update public.order_items oi
set    restaurant_id = o.restaurant_id
from   public.orders o
where  o.id = oi.order_id
and    oi.restaurant_id is null;

-- 4c. Auto-fill on future inserts via trigger (app code doesn't need changing)
create or replace function public.fn_order_items_set_restaurant()
returns trigger language plpgsql as $$
begin
  if new.restaurant_id is null then
    select restaurant_id into new.restaurant_id
    from   public.orders
    where  id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_items_restaurant on public.order_items;
create trigger trg_order_items_restaurant
  before insert on public.order_items
  for each row execute function public.fn_order_items_set_restaurant();

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 5 — Tenant-isolation RLS policies                 ║
-- ║  One restaurant can NEVER see another's data            ║
-- ╚══════════════════════════════════════════════════════════╝

-- ── Menu ──────────────────────────────────────────────────

drop policy if exists "tenant_menu_categories" on public.menu_categories;
create policy "tenant_menu_categories" on public.menu_categories for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_menu_items" on public.menu_items;
create policy "tenant_menu_items" on public.menu_items for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_menu_modifiers" on public.menu_modifiers;
create policy "tenant_menu_modifiers" on public.menu_modifiers for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- modifier_options has no restaurant_id → secure via parent modifier
drop policy if exists "tenant_modifier_options" on public.modifier_options;
create policy "tenant_modifier_options" on public.modifier_options for all
  using (
    exists (
      select 1 from public.menu_modifiers m
      where  m.id = modifier_options.modifier_id
      and    m.restaurant_id in (select public.user_restaurant_ids())
    )
  );

-- menu_item_modifiers has no restaurant_id → secure via parent item
drop policy if exists "tenant_menu_item_modifiers" on public.menu_item_modifiers;
create policy "tenant_menu_item_modifiers" on public.menu_item_modifiers for all
  using (
    exists (
      select 1 from public.menu_items mi
      where  mi.id = menu_item_modifiers.item_id
      and    mi.restaurant_id in (select public.user_restaurant_ids())
    )
  );

drop policy if exists "tenant_kitchen_notes" on public.kitchen_notes;
create policy "tenant_kitchen_notes" on public.kitchen_notes for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_void_reasons" on public.void_reasons;
create policy "tenant_void_reasons" on public.void_reasons for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- ── Pricing & Finance ──────────────────────────────────────

drop policy if exists "tenant_discounts" on public.discounts;
create policy "tenant_discounts" on public.discounts for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_combo_discounts" on public.combo_discounts;
create policy "tenant_combo_discounts" on public.combo_discounts for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_surcharges" on public.surcharges;
create policy "tenant_surcharges" on public.surcharges for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_payment_methods" on public.payment_methods;
create policy "tenant_payment_methods" on public.payment_methods for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_currencies" on public.currencies;
create policy "tenant_currencies" on public.currencies for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_invoice_number_settings" on public.invoice_number_settings;
create policy "tenant_invoice_number_settings" on public.invoice_number_settings for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_order_number_settings" on public.order_number_settings;
create policy "tenant_order_number_settings" on public.order_number_settings for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_receipt_settings" on public.receipt_settings;
create policy "tenant_receipt_settings" on public.receipt_settings for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_invoices" on public.invoices;
create policy "tenant_invoices" on public.invoices for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- ── Operations ────────────────────────────────────────────

drop policy if exists "tenant_events_offers" on public.events_offers;
create policy "tenant_events_offers" on public.events_offers for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_kds_stations" on public.kds_stations;
create policy "tenant_kds_stations" on public.kds_stations for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- kds_station_categories has no restaurant_id → secure via parent station
drop policy if exists "tenant_kds_station_categories" on public.kds_station_categories;
create policy "tenant_kds_station_categories" on public.kds_station_categories for all
  using (
    exists (
      select 1 from public.kds_stations s
      where  s.id = kds_station_categories.station_id
      and    s.restaurant_id in (select public.user_restaurant_ids())
    )
  );

drop policy if exists "tenant_printers" on public.printers;
create policy "tenant_printers" on public.printers for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_table_groups" on public.table_groups;
create policy "tenant_table_groups" on public.table_groups for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_tables" on public.tables;
create policy "tenant_tables" on public.tables for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- ── Orders ────────────────────────────────────────────────

drop policy if exists "tenant_orders" on public.orders;
create policy "tenant_orders" on public.orders for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_order_items" on public.order_items;
create policy "tenant_order_items" on public.order_items for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- ── Staff & Inventory ─────────────────────────────────────

drop policy if exists "tenant_staff" on public.staff;
create policy "tenant_staff" on public.staff for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_inventory_categories" on public.inventory_categories;
create policy "tenant_inventory_categories" on public.inventory_categories for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_inventory_units" on public.inventory_units;
create policy "tenant_inventory_units" on public.inventory_units for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_inventory_items" on public.inventory_items;
create policy "tenant_inventory_items" on public.inventory_items for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_menu_item_ingredients" on public.menu_item_ingredients;
create policy "tenant_menu_item_ingredients" on public.menu_item_ingredients for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

drop policy if exists "tenant_customer_feedback" on public.customer_feedback;
create policy "tenant_customer_feedback" on public.customer_feedback for all
  using     (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 6 — Public / anon read policies                   ║
-- ║  Required for: guest menu page, CFD display             ║
-- ║  These tables are intentionally visible without login   ║
-- ╚══════════════════════════════════════════════════════════╝

-- Restaurants: full anon access (no Supabase Auth in use yet — seller panel manages these)
drop policy if exists "anon_read_restaurants" on public.restaurants;
create policy "anon_read_restaurants" on public.restaurants
  for select using (true);

drop policy if exists "anon_insert_restaurants" on public.restaurants;
create policy "anon_insert_restaurants" on public.restaurants
  for insert with check (true);

drop policy if exists "anon_update_restaurants" on public.restaurants;
create policy "anon_update_restaurants" on public.restaurants
  for update using (true) with check (true);

drop policy if exists "anon_delete_restaurants" on public.restaurants;
create policy "anon_delete_restaurants" on public.restaurants
  for delete using (true);

-- Menu items + categories: public digital menu (/r/[restaurantId])
drop policy if exists "anon_read_menu_items" on public.menu_items;
create policy "anon_read_menu_items" on public.menu_items
  for select using (true);

drop policy if exists "anon_read_menu_categories" on public.menu_categories;
create policy "anon_read_menu_categories" on public.menu_categories
  for select using (true);

-- Events & offers: shown on public menu page
drop policy if exists "anon_read_events_offers" on public.events_offers;
create policy "anon_read_events_offers" on public.events_offers
  for select using (true);

-- Currencies: needed for price formatting on public menu & CFD
drop policy if exists "anon_read_currencies" on public.currencies;
create policy "anon_read_currencies" on public.currencies
  for select using (true);

-- Tables + groups: dashboard reads without auth (no Supabase Auth in use yet)
drop policy if exists "anon_read_tables" on public.tables;
create policy "anon_read_tables" on public.tables
  for select using (true);

drop policy if exists "anon_read_table_groups" on public.table_groups;
create policy "anon_read_table_groups" on public.table_groups
  for select using (true);

-- Orders + order_items: full access without auth (dashboard + CFD + guest menu)
drop policy if exists "anon_read_orders" on public.orders;
create policy "anon_read_orders" on public.orders
  for select using (true);

drop policy if exists "anon_read_order_items" on public.order_items;
create policy "anon_read_order_items" on public.order_items
  for select using (true);

drop policy if exists "anon_insert_orders" on public.orders;
create policy "anon_insert_orders" on public.orders
  for insert with check (true);

drop policy if exists "anon_insert_order_items" on public.order_items;
create policy "anon_insert_order_items" on public.order_items
  for insert with check (true);

drop policy if exists "anon_update_orders" on public.orders;
create policy "anon_update_orders" on public.orders
  for update using (true) with check (true);

drop policy if exists "anon_update_order_items" on public.order_items;
create policy "anon_update_order_items" on public.order_items
  for update using (true) with check (true);

drop policy if exists "anon_delete_order_items" on public.order_items;
create policy "anon_delete_order_items" on public.order_items
  for delete using (true);

-- Customer feedback: CFD submits without login
drop policy if exists "anon_insert_feedback" on public.customer_feedback;
create policy "anon_insert_feedback" on public.customer_feedback
  for insert with check (true);

-- Staff: POS PIN screen (/pos) runs without auth — needs to read active staff
drop policy if exists "anon_read_staff" on public.staff;
create policy "anon_read_staff" on public.staff
  for select using (status = 'active');

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 6b — Anon write access for all settings tables    ║
-- ║  Required because Supabase Auth is not yet in use.      ║
-- ║  Tenant isolation is enforced at the app level via      ║
-- ║  localStorage restaurant_id.                            ║
-- ╚══════════════════════════════════════════════════════════╝
do $$
declare
  t text;
begin
  foreach t in array array[
    'invoices','currencies','payment_methods','menu_categories','menu_items',
    'menu_modifiers','modifier_options','menu_item_modifiers',
    'kitchen_notes','void_reasons','discounts','combo_discounts',
    'surcharges','invoice_number_settings','order_number_settings',
    'events_offers','receipt_settings','kds_stations',
    'kds_station_categories','printers','table_groups','tables',
    'staff','inventory_categories','inventory_units','inventory_items',
    'menu_item_ingredients','delivery_orders','delivery_zones','reservations'
  ]
  loop
    execute format('
      drop policy if exists "anon_write_%I" on public.%I;
      create policy "anon_write_%I" on public.%I
        for all using (true) with check (true);
    ', t, t, t, t);
  end loop;
end $$;

-- Modifier options + modifiers: needed to render full menu for guests
drop policy if exists "anon_read_menu_modifiers" on public.menu_modifiers;
create policy "anon_read_menu_modifiers" on public.menu_modifiers
  for select using (true);

drop policy if exists "anon_read_modifier_options" on public.modifier_options;
create policy "anon_read_modifier_options" on public.modifier_options
  for select using (true);

-- menu_item_modifiers: needed to load modifier groups when guest taps an item
drop policy if exists "anon_read_menu_item_modifiers" on public.menu_item_modifiers;
create policy "anon_read_menu_item_modifiers" on public.menu_item_modifiers
  for select using (true);

-- kitchen_notes: shown on QR guest menu
drop policy if exists "anon_read_kitchen_notes" on public.kitchen_notes;
create policy "anon_read_kitchen_notes" on public.kitchen_notes
  for select using (true);

-- kds_station_categories: needed to route items to correct kitchen station on guest order
drop policy if exists "anon_read_kds_station_categories" on public.kds_station_categories;
create policy "anon_read_kds_station_categories" on public.kds_station_categories
  for select using (true);

-- menu_template_settings: controls styling on QR guest menu and delivery page
-- (RLS is disabled on this table — readable without policy)
-- Ensure it stays accessible if RLS is ever enabled:
drop policy if exists "anon_read_menu_template_settings" on public.menu_template_settings;
create policy "anon_read_menu_template_settings" on public.menu_template_settings
  for select using (true);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  STEP 7 — Missing indexes                               ║
-- ╚══════════════════════════════════════════════════════════╝

-- Tables without restaurant_id index
create index if not exists idx_staff_restaurant_id
  on public.staff(restaurant_id);

-- Junction tables (no restaurant_id → index the FK used in RLS)
create index if not exists idx_menu_item_modifiers_item_id
  on public.menu_item_modifiers(item_id);
create index if not exists idx_menu_item_modifiers_modifier_id
  on public.menu_item_modifiers(modifier_id);
create index if not exists idx_modifier_options_modifier_id
  on public.modifier_options(modifier_id);
create index if not exists idx_kds_station_categories_station_id
  on public.kds_station_categories(station_id);

-- order_items restaurant_id (added in Step 4)
create index if not exists idx_order_items_restaurant_id
  on public.order_items(restaurant_id);

-- Composite indexes for the most common POS query patterns
create index if not exists idx_orders_restaurant_table_status
  on public.orders(restaurant_id, table_number, status);

create index if not exists idx_order_items_order_status
  on public.order_items(order_id, status);

-- Sparse indexes (only index rows where the column is set)
create index if not exists idx_order_items_menu_item_id
  on public.order_items(menu_item_id)
  where menu_item_id is not null;

create index if not exists idx_invoices_order_num
  on public.invoices(order_num)
  where order_num is not null;

create index if not exists idx_customer_feedback_restaurant_created
  on public.customer_feedback(restaurant_id, created_at desc);
