-- ============================================================
-- 20260907_01 — a printer can serve multiple roles (purposes text[])
-- ------------------------------------------------------------
-- Until now a printer had ONE `purpose` (receipt | kitchen | label | bar), so a
-- single physical unit that prints both the kitchen ticket AND the cashier
-- receipt had to be added twice (same bt_address, two rows). Add `purposes
-- text[]`; keep the scalar `purpose` in sync with purposes[0] so any older
-- reader keeps working.
--
-- Additive + one-time backfill, no destructive change.
-- ============================================================

alter table public.printers
  add column if not exists purposes text[] not null default array['receipt']::text[];

-- `add column ... default` filled every existing row with {receipt};
-- restore each row's real role from the scalar column.
update public.printers
  set purposes = array[coalesce(nullif(purpose, ''), 'receipt')]::text[];

alter table public.printers
  drop constraint if exists printers_purposes_valid;
alter table public.printers
  add constraint printers_purposes_valid
  check (
    purposes <@ array['receipt','kitchen','label','bar']::text[]
    and cardinality(purposes) >= 1
  );

comment on column public.printers.purposes is
  'Roles this printer serves (receipt, kitchen, label, bar). purpose = purposes[0], kept in sync for legacy readers.';
