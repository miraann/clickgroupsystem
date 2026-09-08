-- ============================================================
-- 20260908_01 — Storage RLS for the `logos` bucket
-- ------------------------------------------------------------
-- Bug: saving a logo on /dashboard/settings/restaurant-info fails with
--   "new row violates row-level security policy"
-- Cause: the `logos` bucket has RLS on storage.objects but NO write policy.
--   (menu-images / receipts already have equivalent policies.)
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Bucket must exist and stay public (the guest menu shows the logo).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Names are distinct from the legacy logos_select/logos_insert/logos_update
-- so the 20260829_02 tenant-RLS migration's drop-list does not remove them.
drop policy if exists "logos_read_public"        on storage.objects;
drop policy if exists "logos_write_authenticated" on storage.objects;
drop policy if exists "logos_update_authenticated" on storage.objects;
drop policy if exists "logos_delete_authenticated" on storage.objects;

-- Public read (downloads already work via the public URL; this also covers
-- the Storage list/download API).
create policy "logos_read_public"
  on storage.objects for select
  using ( bucket_id = 'logos' );

-- The dashboard mints a real Supabase session at login (session-bridge),
-- so writers are `authenticated`.
create policy "logos_write_authenticated"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'logos' );

create policy "logos_update_authenticated"
  on storage.objects for update to authenticated
  using ( bucket_id = 'logos' )
  with check ( bucket_id = 'logos' );

create policy "logos_delete_authenticated"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'logos' );
