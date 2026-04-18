-- Customer Feedback from CFD (Customer Facing Display)
-- Run this in your Supabase SQL editor

create table if not exists public.customer_feedback (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  table_num     text,
  rating        smallint check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);

alter table public.customer_feedback enable row level security;

drop policy if exists "dev_customer_feedback" on public.customer_feedback;
create policy "dev_customer_feedback"
  on public.customer_feedback for all using (true) with check (true);

create index if not exists idx_customer_feedback_restaurant on public.customer_feedback(restaurant_id);
create index if not exists idx_customer_feedback_created    on public.customer_feedback(created_at desc);
