-- ============================================================
-- Tables & Table Groups schema — run in Supabase SQL Editor
-- ============================================================

create table if not exists public.table_groups (
  id            uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name          text not null,
  color         text default '#3b82f6',
  sort_order    int  default 0,
  created_at    timestamptz default now()
);

create table if not exists public.tables (
  id            uuid default gen_random_uuid() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  group_id      uuid references public.table_groups(id) on delete set null,
  seq           int  not null,           -- integer used in orders (table_number)
  table_number  text not null,           -- display label e.g. T01
  name          text,
  capacity      int  default 4,
  shape         text default 'Square' check (shape in ('Square', 'Round', 'Rectangle')),
  sort_order    int  default 0,
  active        boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_tables_restaurant_id   on public.tables(restaurant_id);
create index if not exists idx_table_groups_restaurant on public.table_groups(restaurant_id);

alter table public.table_groups disable row level security;
alter table public.tables       disable row level security;

-- Seed demo groups for the existing restaurant
insert into public.table_groups (restaurant_id, name, color, sort_order)
select id, 'Ground Floor', '#3b82f6', 0 from public.restaurants limit 1
on conflict do nothing;

insert into public.table_groups (restaurant_id, name, color, sort_order)
select id, 'Rooftop', '#10b981', 1 from public.restaurants limit 1
on conflict do nothing;
