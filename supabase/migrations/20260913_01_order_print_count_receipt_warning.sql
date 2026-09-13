-- ============================================================
-- 20260913_01 — Track receipt print count + printable warning line
-- ------------------------------------------------------------
-- Cashiers can print a customer receipt from an order's payment screen
-- (screen=payment) any number of times before ever finalizing payment.
-- When two tables order the same food, a duplicate print from one order
-- can be handed to a different table, cash collected for it, and only the
-- original order ever gets marked paid in the system — the duplicate
-- leaves no trace.
--
-- `orders.print_count` / `last_printed_at` make repeat prints on a single
-- still-open order visible right on the Print Receipt button, and
-- `receipt_settings.warning_msg` / `show_warning` let a restaurant print a
-- deterrent line on every receipt.
-- ============================================================

alter table public.orders
  add column if not exists print_count     integer not null default 0,
  add column if not exists last_printed_at timestamptz;

-- Opt-in: a restaurant writes its own warning text in Settings → Receipt;
-- nothing is printed until they turn it on themselves.
alter table public.receipt_settings
  add column if not exists warning_msg  text,
  add column if not exists show_warning boolean not null default false;
