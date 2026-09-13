-- ============================================================
-- 20260913_02 — Undo the auto-enabled receipt warning
-- ------------------------------------------------------------
-- 20260913_01 shipped receipt_settings.show_warning defaulting to true with
-- a seeded English warning_msg, which ADD COLUMN ... DEFAULT backfilled onto
-- every existing restaurant — so the notice started printing on live
-- receipts (in English, even for Kurdish-language receipts) without anyone
-- asking for it. Turning it off should have been opt-in from the start.
-- This resets any row still holding that auto-seeded value back to off/blank
-- so a restaurant only gets the warning once they write their own text in
-- Settings → Receipt.
-- ============================================================

update public.receipt_settings
   set show_warning = false,
       warning_msg  = null
 where warning_msg = 'This is the only valid receipt for this order — report duplicates to management.';

-- The live column-level default from 20260913_01 was `true` / the seeded
-- text — fix it so any restaurant created from now on starts opted out too.
alter table public.receipt_settings
  alter column show_warning set default false,
  alter column warning_msg  drop default;
