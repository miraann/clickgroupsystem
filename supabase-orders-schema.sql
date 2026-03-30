-- ============================================================
-- Orders schema — run in Supabase SQL Editor
-- ============================================================

-- ORDERS TABLE
create table if not exists public.orders (
  id            uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  table_number  int not null,
  guests        int default 0,
  status        text not null default 'active'
                  check (status in ('active', 'paid', 'void', 'cancelled')),
  note          text,
  total         numeric(10,2) default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ORDER ITEMS TABLE
create table if not exists public.order_items (
  id          uuid default gen_random_uuid() primary key,
  order_id    uuid references public.orders(id) on delete cascade not null,
  item_name   text not null,
  item_price  numeric(10,2) not null,
  qty         int not null default 1,
  status      text not null default 'pending'
                check (status in ('pending', 'sent', 'void')),
  note        text,
  created_at  timestamptz default now()
);

-- If order_items already exists, add missing columns:
alter table public.order_items add column if not exists note text;
alter table public.order_items add column if not exists void_reason text;

-- Add KDS statuses (cooking, ready) to the status check constraint:
alter table public.order_items drop constraint if exists order_items_status_check;
alter table public.order_items add constraint order_items_status_check
  check (status in ('pending', 'sent', 'cooking', 'ready', 'void'));

-- Store generated order number on the order record (set when invoice is created):
alter table public.orders add column if not exists order_num text;

-- Track who placed the order: 'guest' (QR scan) or 'staff' (system user)
alter table public.orders add column if not exists source text default 'staff' check (source in ('guest', 'staff'));

-- Timing columns for KDS analytics:
alter table public.order_items add column if not exists sent_at            timestamptz;  -- when staff approved (pending→sent)
alter table public.order_items add column if not exists cooking_started_at timestamptz;  -- when chef started cooking (sent→cooking)
alter table public.order_items add column if not exists ready_at           timestamptz;  -- when chef marked ready (cooking→ready)

-- Indexes
create index if not exists idx_orders_restaurant_id on public.orders(restaurant_id);
create index if not exists idx_orders_status        on public.orders(status);
create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- Disable RLS for development (re-enable with proper policies before production)
alter table public.orders      disable row level security;
alter table public.order_items disable row level security;
