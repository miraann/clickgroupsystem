-- ─────────────────────────────────────────────────────────────────────────────
-- KDS Stations — fix station_id FK on order_items
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- The first SQL run created station_id referencing the wrong table (kitchen_stations).
-- Drop the bad constraint and recreate it pointing to the correct kds_stations table.

-- 1. Drop wrong FK (safe — does nothing if it doesn't exist under this name)
alter table public.order_items
  drop constraint if exists order_items_station_id_fkey;

-- 2. Also drop the column entirely so we can re-add it cleanly
--    (skip this if you want to keep existing station_id values — but they're all null anyway)
alter table public.order_items
  drop column if exists station_id;

-- 3. Re-add with correct reference to kds_stations
alter table public.order_items
  add column station_id uuid references public.kds_stations(id) on delete set null;

-- 4. Drop the leftover kitchen_stations table from the failed first attempt
drop table if exists public.kitchen_stations cascade;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify: constraint should now reference kds_stations
select
  tc.constraint_name,
  ccu.table_name as references_table
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
where tc.table_name = 'order_items'
  and tc.constraint_type = 'FOREIGN KEY'
  and ccu.column_name = 'id'
  and ccu.table_name in ('kds_stations', 'kitchen_stations');
