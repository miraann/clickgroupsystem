-- Takeout orders support
-- Run in Supabase SQL Editor

-- 1. Widen the source check constraint to include 'takeout' (and 'delivery' if not already)
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check
  check (source in ('guest', 'staff', 'delivery', 'takeout'));

-- 2. Add customer info columns for takeout (and future delivery use)
alter table public.orders add column if not exists customer_name  text;
alter table public.orders add column if not exists customer_phone text;
