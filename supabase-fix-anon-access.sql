-- Fix: ensure POS tables are accessible without Supabase Auth
-- Run this in Supabase SQL Editor if payment methods, discounts, surcharges,
-- or other settings tables appear empty in the dashboard/POS.

-- Payment methods (needed for payment screen)
drop policy if exists "anon_read_payment_methods"  on public.payment_methods;
drop policy if exists "anon_write_payment_methods" on public.payment_methods;
create policy "anon_all_payment_methods" on public.payment_methods
  for all using (true) with check (true);

-- Discounts & surcharges (needed for payment screen)
drop policy if exists "anon_read_discounts"  on public.discounts;
drop policy if exists "anon_write_discounts" on public.discounts;
create policy "anon_all_discounts" on public.discounts
  for all using (true) with check (true);

drop policy if exists "anon_read_surcharges"  on public.surcharges;
drop policy if exists "anon_write_surcharges" on public.surcharges;
create policy "anon_all_surcharges" on public.surcharges
  for all using (true) with check (true);

-- Invoice & order number settings (needed for payment finalization)
drop policy if exists "anon_read_invoice_number_settings"  on public.invoice_number_settings;
drop policy if exists "anon_write_invoice_number_settings" on public.invoice_number_settings;
create policy "anon_all_invoice_number_settings" on public.invoice_number_settings
  for all using (true) with check (true);

drop policy if exists "anon_read_order_number_settings"  on public.order_number_settings;
drop policy if exists "anon_write_order_number_settings" on public.order_number_settings;
create policy "anon_all_order_number_settings" on public.order_number_settings
  for all using (true) with check (true);

-- Invoices (needed to save invoice after payment)
drop policy if exists "anon_read_invoices"  on public.invoices;
drop policy if exists "anon_write_invoices" on public.invoices;
create policy "anon_all_invoices" on public.invoices
  for all using (true) with check (true);
