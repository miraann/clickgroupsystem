-- ============================================================
-- 20260907_02 — two more printer roles: report + reprint
-- ------------------------------------------------------------
-- 'report'  — the Daily Sales report          (features fall back to 'receipt')
-- 'reprint' — one-tap reprint of an old invoice (falls back to 'receipt')
--
-- Widens the CHECK on both `purpose` (scalar) and `purposes` (text[]).
-- Additive only; no data change.
-- ============================================================

alter table public.printers
  drop constraint if exists printers_purposes_valid;
alter table public.printers
  add constraint printers_purposes_valid
  check (
    purposes <@ array['receipt','kitchen','label','bar','report','reprint']::text[]
    and cardinality(purposes) >= 1
  );

alter table public.printers
  drop constraint if exists printers_purpose_check;
alter table public.printers
  add constraint printers_purpose_check
  check (purpose in ('receipt','kitchen','label','bar','report','reprint'));
