-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Realtime — Enable postgres_changes for ClickGroup POS
-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add the tables that need real-time updates to the supabase_realtime publication.
-- Without this, supabase.channel().on('postgres_changes', ...) will never fire.

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;

-- ─────────────────────────────────────────────────────────────────────────────
-- Pages that use these channels and what they listen to:
--
--  /dashboard              → orders (all), order_items (all)
--  /dashboard/pending-orders → order_items (INSERT, UPDATE)
--  /dashboard/kds          → order_items (all), orders (all)
--  /dashboard/order/[table]→ order_items (UPDATE, filtered by order_id)
--  /guest/[tableId]        → order_items (UPDATE + INSERT, filtered by order_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- Optional: verify the tables are in the publication
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
