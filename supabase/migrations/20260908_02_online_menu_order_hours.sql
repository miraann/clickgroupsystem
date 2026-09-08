-- ============================================================
-- 20260908_02 — online menu "ordering hours" window
-- ------------------------------------------------------------
-- The public online menu (/order/[slug], /r/[slug]) can now accept food orders
-- only during a daily time window. Outside it the page still loads — order
-- tracking, events & offers and social links stay visible — but the category
-- browser, item list and cart are hidden until the window re-opens.
--
--   order_hours_enabled  false → always open (unchanged behaviour)
--   order_open_time       'HH:MM' device-local time the window opens
--   order_close_time      'HH:MM' device-local time it closes
--                         (close < open means the window crosses midnight)
--
-- Additive, no destructive change.
-- ============================================================

alter table public.menu_template_settings
  add column if not exists order_hours_enabled boolean not null default false,
  add column if not exists order_open_time     text    not null default '10:00',
  add column if not exists order_close_time    text    not null default '23:00';

comment on column public.menu_template_settings.order_hours_enabled is
  'When true, the online menu only accepts orders between order_open_time and order_close_time (device-local time). Outside the window the menu still loads but ordering is hidden.';
