-- ============================================================
-- RUN THIS IN YOUR SUPABASE SQL EDITOR
-- Allows the restaurant info page to read/write without full auth.
-- Tighten these policies before going to production.
-- ============================================================
-- Allow anon/authenticated to read & update restaurants
create policy "dev_restaurants_select" on public.restaurants for
select using (true);
create policy "dev_restaurants_update" on public.restaurants for
update using (true) with check (true);
create policy "dev_restaurants_insert" on public.restaurants for
insert with check (true);
-- Storage bucket for logos (run once)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true) on conflict (id) do nothing;
-- Allow anyone to upload/read logos
create policy "logos_select" on storage.objects for
select using (bucket_id = 'logos');
create policy "logos_insert" on storage.objects for
insert with check (bucket_id = 'logos');
create policy "logos_update" on storage.objects for
update using (bucket_id = 'logos');
-- Seed: insert a demo restaurant if none exists
insert into public.restaurants (id, name, email, phone, address, status, plan)
select '00000000-0000-0000-0000-000000000001',
  'Spice Garden',
  'info@spicegarden.com',
  '+964 750 123 4567',
  '123 Food Street, Erbil, Kurdistan, Iraq',
  'active',
  'professional'
where not exists (
    select 1
    from public.restaurants
    limit 1
  );