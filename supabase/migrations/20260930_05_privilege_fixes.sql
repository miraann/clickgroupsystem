-- ============================================================
-- 20260930_05 — Close privilege-escalation paths found on the live DB
-- ------------------------------------------------------------
-- Run AFTER 20260928_02 / _03. Independent of the app deploy: nothing in the
-- app writes the rows / columns this takes away (every write below goes
-- through a service-role API route).
--
-- Found 2026-09-30 by reading pg_policies / pg_trigger on production:
--
--   1. handle_new_user() (trigger on auth.users) copied `role` from the
--      sign-up metadata, which the caller controls — and Auth sign-ups are
--      open. Signing up with {"role":"seller"} matched the "Sellers can …"
--      policies on restaurants: read and UPDATE every restaurant, including
--      setting owner_id to yourself → full takeover of any tenant.
--   2. restaurants: the tenant policy allowed every column and DELETE, so any
--      staff device (all share the owner's identity) could change its own
--      plan / status / owner_id / menu_slug, or delete the restaurant.
--   3. staff / restaurant_roles / restaurant_users: tenant ALL policies let a
--      cashier write these directly and skip the permission checks in
--      /api/settings/staff and /api/settings/roles (e.g. give their own role
--      every permission, or reset the manager's PIN).
--   4. plans: `plans_all` — anyone could edit subscription plans.
--   5. discount_codes: USING was tenant-scoped but WITH CHECK was `true`, so
--      any signed-in user could write codes into any restaurant.
-- ============================================================

begin;

-- ── 1. Sign-up can't pick its own role; no seller role in the DB ──────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'owner');
  return new;
end $$;

update public.profiles set role = 'owner' where role is distinct from 'owner';

-- The seller panel is /api/seller/* with the service role; nothing in the
-- database should grant a "seller" anything.
drop policy if exists "Sellers can insert restaurants"               on public.restaurants;
drop policy if exists "Sellers can update restaurants"               on public.restaurants;
drop policy if exists "Sellers can view all restaurants"             on public.restaurants;
drop policy if exists "Restaurant members can view their restaurant" on public.restaurants;
drop policy if exists "Restaurant owners can update own restaurant"  on public.restaurants;
drop policy if exists "Sellers can view all profiles"                    on public.profiles;
drop policy if exists "Restaurant owners can view their staff profiles"  on public.profiles;
drop policy if exists "Sellers can view all restaurant users"               on public.restaurant_users;
drop policy if exists "Restaurant members can view their restaurant users"  on public.restaurant_users;
drop policy if exists "Restaurant owners can manage their users"            on public.restaurant_users;

-- Profiles: a signed-in user reads its own row; no client writes.
drop policy if exists own_profile_update on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- ── 2. restaurants: only the fields the dashboard edits ───────────────────
-- (restaurant-info, delivery, dine-in, inventory and whatsapp settings pages)
revoke insert, update, delete on public.restaurants from anon, authenticated;
grant update (name, email, phone, address, logo_url, settings, updated_at)
  on public.restaurants to authenticated;

-- ── 3. Staff accounts, roles, memberships: API routes only ────────────────
revoke insert, update, delete on public.staff            from anon, authenticated;
revoke insert, update, delete on public.restaurant_roles from anon, authenticated;
revoke insert, update, delete on public.restaurant_users from anon, authenticated;

-- ── 4. plans: readable by all, written by the seller API only ─────────────
drop policy if exists plans_all         on public.plans;
drop policy if exists public_read_plans on public.plans;
create policy public_read_plans on public.plans for select to anon, authenticated using (true);
revoke insert, update, delete on public.plans from anon, authenticated;

-- ── 5. discount_codes: tenant-scoped both ways ────────────────────────────
drop policy if exists restaurant_manage_discount_codes on public.discount_codes;
drop policy if exists tenant_discount_codes            on public.discount_codes;
create policy tenant_discount_codes on public.discount_codes for all to authenticated
  using      (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

notify pgrst, 'reload schema';

commit;
