-- ============================================================
-- 20260928_02 — Groundwork for closing the remaining anon reads
-- ------------------------------------------------------------
-- Additive / safe to run BEFORE the matching app deploy. Nothing here takes
-- access away from a page that is still using it; 20260928_03 does the
-- closing and must run only AFTER the new build is live.
--
-- A probe with the bare anon key on 2026-09-28 found these still readable by
-- anyone, across every restaurant: delivery_orders (customer name / phone /
-- address / GPS), customers, members, profiles, audit_logs,
-- delivery_notifications, push_subscriptions, role_messages, orders,
-- order_items. It also found restaurant_users' policies recurse into
-- themselves, so every query touching restaurant_users, delivery_zones or
-- whatsapp_logs fails with 42P17 "infinite recursion detected in policy".
--
--   1. security_policy_report() / security_trigger_report() — service-role
--      only, so the live policy state can be checked from a script instead
--      of guessed from the repo's SQL files.
--   2. restaurant_users / profiles — replace the recursive supabase-schema.sql
--      policies with non-recursive ones (via the security-definer
--      user_restaurant_ids()); drops profiles' open anon read.
--   3. Trigger functions that guest inserts fire → SECURITY DEFINER. They
--      read orders / write delivery_notifications as the caller; once anon
--      loses those (migration 03) a guest delivery order would fail outright
--      and guest order_items would lose their restaurant_id.
--   4. fn_match_delivery_zone → SECURITY DEFINER, so the delivery checkout can
--      price a zone without anon SELECT on delivery_zones.
--   5. New guest RPCs replacing direct table reads:
--        guest_order_items(order_id)            — QR table-order status tracking
--        guest_validate_discount_code(rid,code) — delivery checkout coupons
--   6. Anon SELECT on kds_stations / kds_station_categories — the QR guest page
--      routes each item to its KDS station client-side and has been silently
--      sending every guest item with station_id = null without it.
-- ============================================================

begin;

-- ── 1. Diagnostics (service role only) ─────────────────────────────────────
create or replace function public.security_policy_report()
returns table (
  table_name text, rls_enabled boolean, policy_name text,
  roles text[], cmd text, qual text, with_check text
)
language sql security definer stable set search_path = public, pg_catalog
as $$
  select c.relname::text, c.relrowsecurity, p.policyname::text,
         p.roles::text[], p.cmd, p.qual, p.with_check
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  order by 1, 3
$$;

create or replace function public.security_trigger_report()
returns table (table_name text, trigger_name text, function_name text, security_definer boolean)
language sql security definer stable set search_path = public, pg_catalog
as $$
  select c.relname::text, t.tgname::text, p.proname::text, p.prosecdef
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p      on p.oid = t.tgfoid
  where n.nspname = 'public' and not t.tgisinternal
  order by 1, 2
$$;

revoke all on function public.security_policy_report()  from public, anon, authenticated;
revoke all on function public.security_trigger_report() from public, anon, authenticated;
grant execute on function public.security_policy_report()  to service_role;
grant execute on function public.security_trigger_report() to service_role;

-- ── 2. restaurant_users / profiles: non-recursive policies ─────────────────
do $$
declare pol record;
begin
  for pol in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('restaurant_users', 'profiles')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table public.restaurant_users enable row level security;
create policy tenant_restaurant_users on public.restaurant_users for all to authenticated
  using      (restaurant_id in (select public.user_restaurant_ids()))
  with check (restaurant_id in (select public.user_restaurant_ids()));

alter table public.profiles enable row level security;
create policy own_profile_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy own_profile_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── 3. Trigger functions fired by guest inserts → SECURITY DEFINER ─────────
-- Always derive restaurant_id from the parent order (a guest-supplied value is
-- never trusted), and read that order with definer rights.
create or replace function public.fn_order_items_set_restaurant()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_rid uuid;
begin
  select restaurant_id into v_rid from public.orders where id = new.order_id;
  if v_rid is not null then
    new.restaurant_id := v_rid;
  end if;
  return new;
end;
$$;

create or replace function public.fn_delivery_order_placed_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_order_num text;
begin
  select order_num into v_order_num from public.orders where id = new.order_id;

  insert into public.delivery_notifications (restaurant_id, delivery_order_id, recipient_type, type, message, payload)
  values (
    new.restaurant_id, new.id, 'restaurant', 'order_placed',
    'New delivery order' || coalesce(' #' || v_order_num, '') || ' from ' || coalesce(new.customer_name, 'a customer'),
    jsonb_build_object('order_num', v_order_num, 'customer_name', new.customer_name)
  );

  insert into public.delivery_notifications (restaurant_id, delivery_order_id, recipient_type, type, message, payload)
  values (
    new.restaurant_id, new.id, 'customer', 'order_placed',
    'Your order has been received and is awaiting confirmation.',
    jsonb_build_object('order_num', v_order_num)
  );

  return new;
end;
$$;

create or replace function public.fn_delivery_status_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_order_num text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select order_num into v_order_num from public.orders where id = new.order_id;

  insert into public.delivery_notifications (restaurant_id, delivery_order_id, recipient_type, type, message, payload)
  values (
    new.restaurant_id, new.id, 'customer', 'status_changed',
    case new.status
      when 'confirmed'         then 'Your order has been confirmed and is being prepared.'
      when 'preparing'         then 'Your order is being prepared.'
      when 'out_for_delivery'  then 'Your order is on the way' || coalesce(' with ' || new.driver_name, '') || '!'
      when 'delivered'         then 'Your order has been delivered. Enjoy your meal!'
      when 'cancelled'         then 'Your order was cancelled.'
      else 'Your order status was updated to ' || new.status
    end,
    jsonb_build_object('status', new.status, 'order_num', v_order_num, 'driver_name', new.driver_name)
  );

  insert into public.delivery_notifications (restaurant_id, delivery_order_id, recipient_type, type, message, payload)
  values (
    new.restaurant_id, new.id, 'restaurant',
    case new.status when 'cancelled' then 'cancelled' else 'status_changed' end,
    'Order ' || coalesce('#' || v_order_num, '') || ' → ' || new.status,
    jsonb_build_object('status', new.status, 'order_num', v_order_num)
  );

  if new.driver_id is not null and new.status in ('preparing', 'out_for_delivery') then
    insert into public.delivery_notifications (restaurant_id, delivery_order_id, recipient_type, type, message, payload)
    values (
      new.restaurant_id, new.id, 'driver',
      case new.status when 'preparing' then 'driver_assigned' else 'out_for_delivery' end,
      case new.status
        when 'preparing' then 'New delivery assigned: ' || coalesce(new.customer_name, 'a customer')
        else 'Order ready for pickup: ' || coalesce(new.customer_name, 'a customer')
      end,
      jsonb_build_object('status', new.status, 'order_num', v_order_num, 'driver_id', new.driver_id)
    );
  end if;

  perform pg_notify(
    'delivery_status_changed',
    jsonb_build_object(
      'restaurant_id', new.restaurant_id,
      'delivery_order_id', new.id,
      'order_id', new.order_id,
      'status', new.status,
      'driver_id', new.driver_id
    )::text
  );

  return new;
end;
$$;

-- ── 4. Delivery-zone match with definer rights ─────────────────────────────
create or replace function public.fn_match_delivery_zone(
  p_restaurant_id uuid, p_lat double precision, p_lng double precision
) returns public.delivery_zones
language sql stable security definer set search_path = public
as $$
  select z.*
  from public.delivery_zones z
  where z.restaurant_id = p_restaurant_id
    and z.active
    and (
      (z.polygon is not null and jsonb_array_length(z.polygon) >= 3
        and public.fn_point_in_polygon(p_lat, p_lng, z.polygon))
      or
      (z.polygon is null and z.center_lat is not null and z.center_lng is not null and z.radius_meters is not null
        and public.fn_haversine_meters(p_lat, p_lng, z.center_lat, z.center_lng) <= z.radius_meters)
    )
  order by
    (z.polygon is not null) desc,
    z.sort_order asc
  limit 1
$$;
grant execute on function public.fn_match_delivery_zone(uuid, double precision, double precision) to anon, authenticated;

-- ── 5. Guest RPCs ──────────────────────────────────────────────────────────
-- QR table-order tracking. The order id is the capability: the guest only has
-- it because pos_send_to_kitchen returned it. Limited to recent orders so an
-- old id from a shared link can't be replayed forever.
create or replace function public.guest_order_items(p_order_id uuid)
returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'item_name', i.item_name, 'qty', i.qty, 'status', i.status
         ) order by i.created_at), '[]'::jsonb)
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where i.order_id = p_order_id
    and o.created_at > now() - interval '24 hours'
$$;
revoke all on function public.guest_order_items(uuid) from public;
grant execute on function public.guest_order_items(uuid) to anon, authenticated;

-- Delivery-checkout coupon lookup. Exact (case-insensitive) match — the old
-- client query used ILIKE, so a code of '%' matched any active coupon.
create or replace function public.guest_validate_discount_code(p_restaurant_id uuid, p_code text)
returns jsonb
language sql security definer stable set search_path = public
as $$
  select to_jsonb(d)
  from public.discount_codes d
  where d.restaurant_id = p_restaurant_id
    and d.active
    and lower(d.code) = lower(btrim(p_code))
  limit 1
$$;
revoke all on function public.guest_validate_discount_code(uuid, text) from public;
grant execute on function public.guest_validate_discount_code(uuid, text) to anon, authenticated;

-- ── 6. KDS station routing for guest orders ────────────────────────────────
drop policy if exists public_read_kds_stations on public.kds_stations;
create policy public_read_kds_stations on public.kds_stations for select to anon using (true);
drop policy if exists public_read_kds_station_categories on public.kds_station_categories;
create policy public_read_kds_station_categories on public.kds_station_categories for select to anon using (true);

commit;
