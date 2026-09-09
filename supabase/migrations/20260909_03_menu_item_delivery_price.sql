-- ============================================================
-- 20260909_03 — Separate delivery-menu price for menu items
-- ------------------------------------------------------------
-- A menu item can now carry a delivery-only price that differs from its
-- dine-in price. NULL means "no override" — the delivery menu (/order/[slug])
-- falls back to `price`, exactly as before. Dine-in / QR surfaces always use
-- `price` and are unaffected.
--
-- Additive, no destructive change.
-- ============================================================

alter table public.menu_items
  add column if not exists delivery_price numeric;

comment on column public.menu_items.delivery_price is
  'Optional delivery-menu price (/order/[slug]). NULL → the delivery menu uses `price`. Dine-in and QR menus always use `price`.';
