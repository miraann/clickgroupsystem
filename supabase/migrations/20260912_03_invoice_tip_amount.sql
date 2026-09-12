-- ============================================================
-- 20260912_03 — Track tips on invoices
-- ------------------------------------------------------------
-- The payment screen's "Tip" tab now lets a cashier add a gratuity amount.
-- It's charged on top of the bill (added to the invoice total, same as a
-- surcharge) but tracked in its own column so daily-sales reporting can sum
-- tips separately from revenue.
--
-- Additive, no destructive change.
-- ============================================================

alter table public.invoices
  add column if not exists tip_amount numeric(10, 2) default 0;

comment on column public.invoices.tip_amount is
  'Gratuity added on the payment screen, included in `total` but tracked separately for daily-sales tip reporting.';
