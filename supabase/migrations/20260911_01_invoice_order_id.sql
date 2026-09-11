-- ============================================================
-- 20260911_01 — invoices.order_id (closes a double-invoice race
-- on payment finalize)
-- ------------------------------------------------------------
-- Two devices confirming payment on the same order at the same
-- moment both passed validation in /api/payment/finalize (the
-- order's status was still 'active' for both) and both inserted a
-- row into `invoices` — double revenue in reports, two printed
-- receipts, and inventory deducted twice.
--
-- The route now guards the order's 'active' -> 'paid' transition
-- with an atomic UPDATE ... WHERE status = 'active': only the
-- request that actually flips the row runs the invoice insert /
-- inventory deduction / invoice-number bump. The request that
-- loses the race looks up the invoice the winner just created and
-- returns that instead of making its own — which needs a real FK,
-- since invoice_num/order_num alone aren't guaranteed unique
-- long-term (order_num can repeat across table turnovers).
-- ============================================================

alter table public.invoices
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists idx_invoices_order_id on public.invoices(order_id);
