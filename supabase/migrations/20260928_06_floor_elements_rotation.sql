-- ============================================================
-- 20260928_06 — Floor decor rotation
-- ------------------------------------------------------------
-- Doors (which wall, which way they swing) and zones (which side the kitchen
-- pass / cash counter faces) need a real orientation, not just a w/h swap.
-- rot is clockwise degrees: 0, 90, 180 or 270.
--
-- Run after 20260928_05. Until it runs, saving floor decor reports an error.
-- ============================================================

alter table public.floor_elements add column if not exists rot smallint not null default 0;

notify pgrst, 'reload schema';
