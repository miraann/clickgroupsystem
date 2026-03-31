-- ============================================================
-- STAFF TABLE — PIN-based POS login (not tied to Supabase Auth)
-- Run this in your Supabase SQL Editor
-- ============================================================

create table if not exists public.staff (
  id            uuid default uuid_generate_v4() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  name          text not null,
  role          text not null default 'waiter'
                  check (role in ('owner', 'manager', 'cashier', 'waiter', 'chef')),
  pin           text not null,
  color         text not null default 'from-amber-500 to-orange-500',
  status        text not null default 'active' check (status in ('active', 'inactive')),
  email         text,
  phone         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Enable RLS
alter table public.staff enable row level security;

-- Dev policy: allow anon read/write (tighten before production)
create policy "dev_staff_select" on public.staff for select using (true);
create policy "dev_staff_insert" on public.staff for insert with check (true);
create policy "dev_staff_update" on public.staff for update using (true) with check (true);
create policy "dev_staff_delete" on public.staff for delete using (true);

-- Seed demo staff for Spice Garden (restaurant id = 00000000-0000-0000-0000-000000000001)
insert into public.staff (restaurant_id, name, role, pin, color, status)
values
  ('00000000-0000-0000-0000-000000000001', 'Ahmad Karimi',   'owner',   '1234', 'from-violet-500 to-purple-600',  'active'),
  ('00000000-0000-0000-0000-000000000001', 'Layla Hassan',   'manager', '2580', 'from-indigo-500 to-blue-600',    'active'),
  ('00000000-0000-0000-0000-000000000001', 'Omar Khalid',    'cashier', '3690', 'from-emerald-500 to-teal-600',   'active'),
  ('00000000-0000-0000-0000-000000000001', 'Noor Ahmed',     'waiter',  '1470', 'from-amber-500 to-orange-500',   'active'),
  ('00000000-0000-0000-0000-000000000001', 'Karzan Ibrahim', 'chef',    '9630', 'from-rose-500 to-pink-600',      'active'),
  ('00000000-0000-0000-0000-000000000001', 'Soran Ali',      'waiter',  '7410', 'from-cyan-500 to-sky-600',       'inactive')
on conflict do nothing;
