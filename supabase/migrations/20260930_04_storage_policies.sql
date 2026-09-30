-- ============================================================
-- 20260930_04 — Storage: tenant-scoped writes, private receipts
-- ------------------------------------------------------------
-- Run AFTER the build that shows expense receipts through signed URLs
-- (settings/expense/receipt.ts) — older builds link the public URL, which
-- stops working once `receipts` is private.
--
-- Found on the live project (anon key, 2026-09-30):
--   · `receipts` (expense receipts) was a public bucket and anon could list
--     every restaurant's files.
--   · `logos` writes were `to authenticated` with only a bucket check
--     (20260908_01), so any signed-in user — and Auth sign-ups are open —
--     could overwrite or delete any restaurant's logo. The root
--     supabase-dev-policy.sql version didn't even require sign-in.
--   · No MIME restrictions on logos / receipts.
--
-- Now every policy on storage.objects is dropped and replaced by:
--   · logos / menu-images / receipts: signed-in staff may read, upload,
--     replace and delete objects only under their own restaurant's folder.
--     Public URLs of the two public buckets keep working (they bypass RLS);
--     anon can no longer list any bucket.
--   · customer-selfies: no policies — only the service role (/api/upload/selfie).
--
-- Object paths in use:
--   logos        <rid>/logo.<ext>
--   menu-images  <rid>/<ts>.<ext> · events/<rid>/<ts>.webp · receipt/<rid>/<type>.<ext> (service role)
--   receipts     expenses/<rid>/<ts>.<ext>
-- ============================================================

begin;

create or replace function public.storage_path_restaurant(p_name text)
returns uuid
language sql immutable set search_path = public
as $$
  select case
    when f[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then f[1]::uuid
    when f[1] in ('events', 'expenses', 'receipt')
     and f[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then f[2]::uuid
  end
  from (select storage.foldername(p_name) as f) x
$$;
revoke all on function public.storage_path_restaurant(text) from public, anon;
grant execute on function public.storage_path_restaurant(text) to authenticated;

-- ── Drop every existing storage.objects policy ────────────────────────────
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
    raise notice 'dropped storage policy "%"', pol.policyname;
  end loop;
end $$;

-- ── Tenant-scoped staff access ────────────────────────────────────────────
create policy tenant_storage_select on storage.objects for select to authenticated
  using (bucket_id in ('logos', 'menu-images', 'receipts')
         and public.storage_path_restaurant(name) in (select public.user_restaurant_ids()));

create policy tenant_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('logos', 'menu-images', 'receipts')
              and public.storage_path_restaurant(name) in (select public.user_restaurant_ids()));

create policy tenant_storage_update on storage.objects for update to authenticated
  using      (bucket_id in ('logos', 'menu-images', 'receipts')
              and public.storage_path_restaurant(name) in (select public.user_restaurant_ids()))
  with check (bucket_id in ('logos', 'menu-images', 'receipts')
              and public.storage_path_restaurant(name) in (select public.user_restaurant_ids()));

create policy tenant_storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('logos', 'menu-images', 'receipts')
         and public.storage_path_restaurant(name) in (select public.user_restaurant_ids()));

-- ── Buckets ───────────────────────────────────────────────────────────────
update storage.buckets
   set public = false,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'],
       file_size_limit = 10485760
 where id = 'receipts';

update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
       file_size_limit = coalesce(file_size_limit, 2097152)
 where id = 'logos';

update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 where id = 'menu-images';

update storage.buckets
   set public = false,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'customer-selfies';

commit;
