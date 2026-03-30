-- ============================================================
-- Menu Categories schema — run in Supabase SQL Editor
-- ============================================================
create table if not exists public.menu_categories (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  color text default '#f59e0b',
  icon text default null,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_menu_categories_restaurant on public.menu_categories(restaurant_id);
alter table public.menu_categories disable row level security;
-- ============================================================
-- Menu Items
-- ============================================================
create table if not exists public.menu_items (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  category_id uuid references public.menu_categories(id) on delete
  set null,
    name text not null,
    description text,
    price numeric(10, 2) default 0,
    image_url text,
    available boolean default true,
    has_modifiers boolean default false,
    sort_order int default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
-- If menu_items already exists, add the image_url column:
alter table public.menu_items
add column if not exists image_url text;
create index if not exists idx_menu_items_restaurant on public.menu_items(restaurant_id);
create index if not exists idx_menu_items_category on public.menu_items(category_id);
alter table public.menu_items disable row level security;
-- ============================================================
-- Modifiers & Options
-- ============================================================
create table if not exists public.menu_modifiers (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  required boolean default false,
  min_select int default 0,
  max_select int default 1,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists public.modifier_options (
  id uuid default gen_random_uuid() primary key,
  modifier_id uuid references public.menu_modifiers(id) on delete cascade not null,
  name text not null,
  price numeric(10, 2) default 0,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_menu_modifiers_restaurant on public.menu_modifiers(restaurant_id);
create index if not exists idx_modifier_options_modifier on public.modifier_options(modifier_id);
alter table public.menu_modifiers disable row level security;
alter table public.modifier_options disable row level security;
-- ============================================================
-- Item ↔ Modifier join table
-- ============================================================
create table if not exists public.menu_item_modifiers (
  item_id uuid references public.menu_items(id) on delete cascade not null,
  modifier_id uuid references public.menu_modifiers(id) on delete cascade not null,
  primary key (item_id, modifier_id)
);
alter table public.menu_item_modifiers disable row level security;
-- ============================================================
-- Kitchen Notes
-- ============================================================
create table if not exists public.kitchen_notes (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  text text not null,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_kitchen_notes_restaurant on public.kitchen_notes(restaurant_id);
alter table public.kitchen_notes disable row level security;
-- ============================================================
-- Void Reasons
-- ============================================================
create table if not exists public.void_reasons (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  text text not null,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_void_reasons_restaurant on public.void_reasons(restaurant_id);
alter table public.void_reasons disable row level security;
-- ============================================================
-- Discounts
-- ============================================================
create table if not exists public.discounts (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  type text default 'percentage' check (type in ('percentage', 'fixed')),
  value numeric(10, 2) default 0,
  min_order numeric(10, 2) default 0,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_discounts_restaurant on public.discounts(restaurant_id);
alter table public.discounts disable row level security;
-- ============================================================
-- Combo Discounts
-- ============================================================
create table if not exists public.combo_discounts (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  description text,
  buy_qty int default 2,
  get_qty int default 1,
  discount_pct numeric(5, 2) default 100,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_combo_discounts_restaurant on public.combo_discounts(restaurant_id);
alter table public.combo_discounts disable row level security;
-- ============================================================
-- Surcharges
-- ============================================================
create table if not exists public.surcharges (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  type text default 'percentage' check (type in ('percentage', 'fixed')),
  value numeric(10, 2) default 0,
  applied_to text default 'All',
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_surcharges_restaurant on public.surcharges(restaurant_id);
alter table public.surcharges disable row level security;
-- ============================================================
-- Payment Methods
-- ============================================================
create table if not exists public.payment_methods (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  icon_type text default 'cash',
  active boolean default true,
  is_default boolean default false,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_payment_methods_restaurant on public.payment_methods(restaurant_id);
alter table public.payment_methods disable row level security;
-- ============================================================
-- Invoice Number Settings
-- ============================================================
create table if not exists public.invoice_number_settings (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null unique,
  prefix text default 'INV-',
  start_num int default 1001,
  current_num int default 1001,
  reset_period text default 'never' check (
    reset_period in ('never', 'daily', 'monthly', 'yearly')
  ),
  updated_at timestamptz default now()
);
alter table public.invoice_number_settings disable row level security;
-- ============================================================
-- Order Number Settings
-- ============================================================
create table if not exists public.order_number_settings (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null unique,
  prefix text default 'ORD-',
  start_num int default 1,
  current_num int default 1,
  reset_period text default 'daily' check (reset_period in ('never', 'daily', 'shift')),
  show_receipt boolean default true,
  show_kds boolean default true,
  updated_at timestamptz default now()
);
alter table public.order_number_settings disable row level security;
alter table public.menu_items
add column if not exists image_url text;
alter table public.order_items
add column if not exists note text;
alter table public.order_items
add column if not exists void_reason text;
alter table public.order_items
add column if not exists voided_by text;
create table if not exists public.events_offers (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  title text not null,
  description text,
  date_label text,
  image_url text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.events_offers disable row level security;
-- No migration needed if status is a text column (not an enum)
-- If it's an enum, add:
ALTER TYPE order_item_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE order_item_status ADD VALUE IF NOT EXISTS 'ready';
-- ============================================================
-- Receipt Settings
-- ============================================================
create table if not exists public.receipt_settings (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null unique,
  shop_name text,
  logo_url text,
  phone text,
  address text,
  thank_you_msg text default 'Thank you for your visit!',
  footer_note text default 'Powered by ClickGroup System',
  currency_symbol text default '$',
  show_qr boolean default true,
  qr_url text,
  show_logo boolean default true,
  show_address boolean default true,
  show_phone boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.receipt_settings disable row level security;
-- ============================================================
-- Invoices (stored per sale)
-- ============================================================
create table if not exists public.invoices (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  invoice_num text not null,
  order_num text,
  table_num text,
  guests int default 0,
  cashier text,
  payment_method text,
  items jsonb,
  subtotal numeric(10, 2) default 0,
  discount numeric(10, 2) default 0,
  total numeric(10, 2) default 0,
  amount_paid numeric(10, 2) default 0,
  change_amount numeric(10, 2) default 0,
  created_at timestamptz default now()
);
create index if not exists idx_invoices_restaurant on public.invoices(restaurant_id);
create index if not exists idx_invoices_created_at on public.invoices(created_at);
alter table public.invoices disable row level security;
-- ============================================================
-- Currencies
-- ============================================================
create table if not exists public.currencies (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  symbol text not null,
  decimal_places int default 2,
  is_default boolean default false,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_currencies_restaurant on public.currencies(restaurant_id);
alter table public.currencies disable row level security;
-- ============================================================
-- KDS Stations
-- ============================================================
create table if not exists public.kds_stations (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  color text default '#f59e0b',
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_kds_stations_restaurant on public.kds_stations(restaurant_id);
alter table public.kds_stations disable row level security;
-- KDS Station ↔ Category assignments
create table if not exists public.kds_station_categories (
  station_id uuid references public.kds_stations(id) on delete cascade not null,
  category_id uuid references public.menu_categories(id) on delete cascade not null,
  primary key (station_id, category_id)
);
alter table public.kds_station_categories disable row level security;
-- ============================================================
-- Printers
-- ============================================================
create table if not exists public.printers (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name text not null,
  purpose text default 'receipt' check (purpose in ('receipt', 'kitchen', 'label', 'bar')),
  connection_type text default 'ip' check (connection_type in ('ip', 'bluetooth', 'usb')),
  ip_address text,
  port int default 9100,
  bt_address text,
  usb_path text,
  active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_printers_restaurant on public.printers(restaurant_id);
alter table public.printers disable row level security;