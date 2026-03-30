-- Run in Supabase SQL Editor
-- Adds payment fields to orders table

alter table public.orders
  add column if not exists payment_method text,
  add column if not exists amount_paid    numeric(10,2) default 0,
  add column if not exists change_amount  numeric(10,2) default 0,
  add column if not exists paid_at        timestamptz;
