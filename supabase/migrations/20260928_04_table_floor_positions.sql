-- ============================================================
-- 20260928_04 — Dashboard floor plan: per-table position
-- ------------------------------------------------------------
-- Adds pos_x / pos_y (px, from the top-left of the floor canvas) so staff can
-- drag tables anywhere on the dashboard. NULL = not placed yet; a table group
-- whose tables are all NULL keeps the plain auto-flowing grid.
--
-- Additive and safe to run before or after the build that uses it — the
-- dashboard falls back to the grid when the columns are missing. Writes go
-- through the existing tenant_tables RLS policy.
-- ============================================================

alter table public.tables add column if not exists pos_x real;
alter table public.tables add column if not exists pos_y real;

-- Make PostgREST see the new columns immediately.
notify pgrst, 'reload schema';
