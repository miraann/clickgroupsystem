-- ============================================================
-- 20260913_03 — Log every individual receipt print time
-- ------------------------------------------------------------
-- orders.print_count / last_printed_at (20260913_01) only carry a running
-- total and the most recent timestamp — enough for the "N×" badge, but not
-- enough to actually show a manager WHEN each print happened. print_log
-- keeps every timestamp so the invoice view can list them out individually.
-- ============================================================

alter table public.orders
  add column if not exists print_log jsonb not null default '[]'::jsonb;
