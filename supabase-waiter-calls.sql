-- Waiter Paging System
-- Run in Supabase SQL Editor

create table if not exists public.waiter_calls (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid references public.tables(id) on delete set null,
  table_number  text not null,
  table_name    text,
  status        text not null default 'pending' check (status in ('pending', 'acknowledged')),
  created_at    timestamptz not null default now()
);

alter table public.waiter_calls enable row level security;

drop policy if exists "anon_write_waiter_calls" on public.waiter_calls;
create policy "anon_write_waiter_calls" on public.waiter_calls
  for all using (true) with check (true);

create index if not exists idx_waiter_calls_restaurant on public.waiter_calls(restaurant_id);
create index if not exists idx_waiter_calls_status     on public.waiter_calls(restaurant_id, status, created_at desc);
