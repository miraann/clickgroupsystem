-- Add customer info columns to invoices table
-- Run in Supabase SQL Editor

alter table public.invoices add column if not exists customer_name  text;
alter table public.invoices add column if not exists customer_phone text;
