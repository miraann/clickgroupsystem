-- ─────────────────────────────────────────────────────────────────────────────
-- Delivery Notification Engine + Zone/Fee Wiring
-- Run after supabase-delivery-driver.sql and supabase-delivery-address.sql.
-- Follows this project's existing permissive dev-RLS pattern (see
-- supabase-inventory-notifications.sql) — tighten policies before going to
-- production with untrusted anon access if needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. delivery_notifications table
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.delivery_notifications (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  delivery_order_id uuid not null references public.delivery_orders(id) on delete cascade,
  recipient_type    text not null check (recipient_type in ('customer', 'restaurant', 'driver')),
  type              text not null check (type in (
                      'order_placed', 'status_changed', 'driver_assigned',
                      'out_for_delivery', 'delivered', 'cancelled'
                    )),
  message           text not null,
  payload           jsonb not null default '{}'::jsonb,
  is_read           boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.delivery_notifications enable row level security;

drop policy if exists "dev_delivery_notifications" on public.delivery_notifications;
create policy "dev_delivery_notifications"
  on public.delivery_notifications for all using (true) with check (true);

create index if not exists idx_delivery_notif_restaurant     on public.delivery_notifications(restaurant_id, created_at desc);
create index if not exists idx_delivery_notif_order          on public.delivery_notifications(delivery_order_id, created_at desc);
create index if not exists idx_delivery_notif_recipient      on public.delivery_notifications(recipient_type, is_read);

-- Make sure the realtime publication carries this table (mirrors supabase-realtime.sql)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'delivery_notifications'
  ) then
    alter publication supabase_realtime add table public.delivery_notifications;
  end if;
exception when undefined_object then
  -- supabase_realtime publication not present in this project (dashboard-managed instead) — skip
  null;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Driver-targeted push: push_subscriptions gets an optional staff_id
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.push_subscriptions
  add column if not exists staff_id uuid references public.staff(id) on delete cascade;

create index if not exists idx_push_subs_staff on public.push_subscriptions(staff_id) where staff_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Zone-based fee wiring: geo columns on delivery_zones
--    Supports BOTH a circular radius zone and a polygon zone (no PostGIS
--    dependency — plain haversine + ray-casting so it runs on any Supabase
--    plan). A zone matches if either shape contains the point.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.delivery_zones
  add column if not exists center_lat     double precision,
  add column if not exists center_lng     double precision,
  add column if not exists radius_meters  numeric,
  add column if not exists polygon        jsonb; -- array of {lat,lng} vertices, e.g. [{"lat":33.31,"lng":44.36}, ...]

comment on column public.delivery_zones.radius_meters is 'Circular zone radius in meters, used with center_lat/center_lng';
comment on column public.delivery_zones.polygon       is 'Optional polygon vertices [{lat,lng}, ...] for irregular zone shapes; takes precedence over radius when present';

create index if not exists idx_delivery_zones_active on public.delivery_zones(restaurant_id, active, sort_order);

-- Haversine distance in meters
create or replace function public.fn_haversine_meters(
  lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision
) returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    )
  )
$$;

-- Ray-casting point-in-polygon test. polygon is jsonb array of {lat,lng}.
create or replace function public.fn_point_in_polygon(
  p_lat double precision, p_lng double precision, p_polygon jsonb
) returns boolean language plpgsql immutable as $$
declare
  n      int := jsonb_array_length(p_polygon);
  inside boolean := false;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
  i int; j int;
begin
  if n < 3 then return false; end if;
  j := n - 1;
  for i in 0 .. n - 1 loop
    xi := (p_polygon -> i ->> 'lng')::double precision;
    yi := (p_polygon -> i ->> 'lat')::double precision;
    xj := (p_polygon -> j ->> 'lng')::double precision;
    yj := (p_polygon -> j ->> 'lat')::double precision;

    if ((yi > p_lat) <> (yj > p_lat)) and
       (p_lng < (xj - xi) * (p_lat - yi) / nullif(yj - yi, 0) + xi)
    then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end;
$$;

-- Match a lat/lng against a restaurant's active zones. Polygon zones are
-- checked first (more precise), then radius zones, ordered by sort_order so
-- the restaurant controls priority when zones overlap. Returns null (no row)
-- when nothing matches — caller falls back to restaurant.settings defaults.
create or replace function public.fn_match_delivery_zone(
  p_restaurant_id uuid, p_lat double precision, p_lng double precision
) returns public.delivery_zones language sql stable as $$
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
    (z.polygon is not null) desc, -- prefer polygon precision over radius
    z.sort_order asc
  limit 1
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Status-change trigger → notification fan-out (customer/restaurant/driver)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_delivery_status_notify()
returns trigger language plpgsql as $$
declare
  v_order_num text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select order_num into v_order_num from public.orders where id = new.order_id;

  -- Customer-facing notification (order/[slug] tracking screen reads this)
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

  -- Restaurant dashboard notification (bell / activity feed)
  insert into public.delivery_notifications (restaurant_id, delivery_order_id, recipient_type, type, message, payload)
  values (
    new.restaurant_id, new.id, 'restaurant',
    case new.status when 'cancelled' then 'cancelled' else 'status_changed' end,
    'Order ' || coalesce('#' || v_order_num, '') || ' → ' || new.status,
    jsonb_build_object('status', new.status, 'order_num', v_order_num)
  );

  -- Driver-facing notification, only once a driver is assigned and the order
  -- has entered a stage the driver acts on
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

  -- Best-effort logical NOTIFY for anything listening outside Realtime
  -- (webhook relay, external dispatcher). Safe no-op if nothing is listening.
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

drop trigger if exists trg_delivery_status_notify on public.delivery_orders;
create trigger trg_delivery_status_notify
  after update of status on public.delivery_orders
  for each row execute function public.fn_delivery_status_notify();

-- Also notify on initial insert (order placed) so the restaurant feed shows it
-- immediately, matching the push-notification already fired client-side.
create or replace function public.fn_delivery_order_placed_notify()
returns trigger language plpgsql as $$
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

drop trigger if exists trg_delivery_order_placed_notify on public.delivery_orders;
create trigger trg_delivery_order_placed_notify
  after insert on public.delivery_orders
  for each row execute function public.fn_delivery_order_placed_notify();
