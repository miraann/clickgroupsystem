-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Realtime — Enable postgres_changes for ClickGroup POS
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: This Supabase project uses publication FOR ALL TABLES, so every table
-- is already included in realtime. No ALTER TABLE statements are needed.
-- Individual ALTER commands will fail with:
--   "publication is defined as FOR ALL TABLES — tables cannot be added individually"

-- ─────────────────────────────────────────────────────────────────────────────
-- Pages that use postgres_changes and what they listen to:
--
--  /dashboard              → orders (all), order_items (all)
--  /dashboard/pending-orders → order_items (INSERT, UPDATE)
--  /dashboard/kds          → order_items (all), orders (all)
--  /dashboard/order/[table]→ order_items (UPDATE, filtered by order_id)
--  /guest/[tableId]        → order_items (UPDATE + INSERT, filtered by order_id)
--  /guest/[tableId]        → menu_items (*, filtered by restaurant_id) via useRestaurantMenu
--  /order/[slug]           → menu_items (*, filtered by restaurant_id) via useRestaurantMenu
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify the publication mode:
select pubname, puballtables
from pg_publication
where pubname = 'supabase_realtime';
-- puballtables = true → FOR ALL TABLES, no per-table setup needed
