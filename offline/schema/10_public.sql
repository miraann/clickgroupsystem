--
-- PostgreSQL database dump
--

\restrict 3JPeNiLYbEwy9Jq1bMyq9gNCuaBln8vzndPAnfxt4LYn7gVVE1oGq4frPCiUycG

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: check_inventory_expiry(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_inventory_expiry(p_warn_days integer DEFAULT 3) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  -- Expired items
  insert into public.inventory_notifications (restaurant_id, inventory_item_id, type, severity, message, metadata)
  select
    i.restaurant_id, i.id, 'expired', 'critical',
    i.name || ' expired on ' || to_char(i.expiry_date, 'YYYY-MM-DD'),
    jsonb_build_object('expiry_date', i.expiry_date, 'batch_number', i.batch_number)
  from public.inventory_items i
  where i.active
    and i.expiry_date is not null
    and i.expiry_date < current_date
    and not exists (
      select 1 from public.inventory_notifications n
      where n.inventory_item_id = i.id and n.type = 'expired'
        and n.created_at > now() - interval '1 day'
    );

  -- Expiring soon
  insert into public.inventory_notifications (restaurant_id, inventory_item_id, type, severity, message, metadata)
  select
    i.restaurant_id, i.id, 'expiring_soon', 'warning',
    i.name || ' expires on ' || to_char(i.expiry_date, 'YYYY-MM-DD'),
    jsonb_build_object('expiry_date', i.expiry_date, 'batch_number', i.batch_number)
  from public.inventory_items i
  where i.active
    and i.expiry_date is not null
    and i.expiry_date >= current_date
    and i.expiry_date <= current_date + p_warn_days
    and not exists (
      select 1 from public.inventory_notifications n
      where n.inventory_item_id = i.id and n.type = 'expiring_soon'
        and n.created_at > now() - interval '1 day'
    );
end;
$$;


--
-- Name: fn_deduct_inventory_for_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_deduct_inventory_for_order(p_order_id uuid, p_restaurant_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_auto_deduct boolean;
  r_deduct      record;
  v_days_since  numeric;
  v_new_ema     numeric;
begin
  select coalesce((settings->>'inventory_auto_deduct')::boolean, false)
  into v_auto_deduct
  from public.restaurants
  where id = p_restaurant_id;

  if not coalesce(v_auto_deduct, false) then
    return;
  end if;

  for r_deduct in
    select mii.inventory_item_id, sum(mii.quantity * oi.qty) as total_deduct
    from public.order_items oi
    join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
    where oi.order_id = p_order_id
      and oi.status is distinct from 'void'
    group by mii.inventory_item_id
  loop
    -- Lock the row so concurrent payments can't read a stale current_stock
    perform 1 from public.inventory_items where id = r_deduct.inventory_item_id for update;

    select extract(epoch from (now() - coalesce(usage_updated_at, now() - interval '1 day'))) / 86400.0
    into v_days_since
    from public.inventory_items where id = r_deduct.inventory_item_id;

    v_days_since := greatest(coalesce(v_days_since, 1), 0.04); -- floor ~1 hour to avoid div spikes

    update public.inventory_items
    set
      current_stock  = greatest(0, current_stock - r_deduct.total_deduct),
      -- Exponential moving average of "usage per day", alpha = 0.3
      avg_daily_usage = case
        when avg_daily_usage = 0 then r_deduct.total_deduct / v_days_since
        else 0.3 * (r_deduct.total_deduct / v_days_since) + 0.7 * avg_daily_usage
      end,
      usage_updated_at = now()
    where id = r_deduct.inventory_item_id;
  end loop;
end;
$$;


--
-- Name: fn_delivery_order_placed_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_delivery_order_placed_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: fn_delivery_status_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_delivery_status_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: fn_haversine_meters(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) RETURNS double precision
    LANGUAGE sql IMMUTABLE
    AS $$
  select 6371000 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    )
  )
$$;


--
-- Name: fn_inventory_stock_notify(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_inventory_stock_notify() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_low_threshold numeric;
  v_effective_min numeric;
  v_item_name     text;
begin
  if new.current_stock is not distinct from old.current_stock then
    return new;
  end if;

  v_item_name := new.name;

  -- restaurant-level default low-stock threshold (falls back to 5 if unset)
  select coalesce((r.settings->>'inventory_low_threshold')::numeric, 5)
  into v_low_threshold
  from public.restaurants r
  where r.id = new.restaurant_id;

  v_effective_min := greatest(coalesce(new.min_stock, 0), coalesce(v_low_threshold, 0));

  -- ── Stock went DOWN (deduction / sale) ──────────────────────────────────
  if new.current_stock < old.current_stock then

    if new.current_stock <= 0 and old.current_stock > 0 then
      insert into public.inventory_notifications
        (restaurant_id, inventory_item_id, type, severity, message, metadata)
      values (
        new.restaurant_id, new.id, 'out_of_stock', 'critical',
        v_item_name || ' is now out of stock',
        jsonb_build_object('current_stock', new.current_stock, 'previous_stock', old.current_stock)
      );

    elsif new.current_stock <= v_effective_min and old.current_stock > v_effective_min then
      insert into public.inventory_notifications
        (restaurant_id, inventory_item_id, type, severity, message, metadata)
      values (
        new.restaurant_id, new.id, 'low_stock', 'warning',
        v_item_name || ' is running low (' || new.current_stock || ' left)',
        jsonb_build_object('current_stock', new.current_stock, 'min_stock', v_effective_min)
      );
    end if;

    -- Rapid depletion: a single deduction event that alone exceeds 3x the
    -- item's known average daily usage. Requires avg_daily_usage to already
    -- be seeded (see fn_deduct_inventory_for_order) — skips cold-start items.
    if coalesce(new.avg_daily_usage, 0) > 0
       and (old.current_stock - new.current_stock) > (new.avg_daily_usage * 3)
    then
      insert into public.inventory_notifications
        (restaurant_id, inventory_item_id, type, severity, message, metadata)
      values (
        new.restaurant_id, new.id, 'rapid_depletion', 'warning',
        v_item_name || ' is depleting faster than usual',
        jsonb_build_object(
          'deducted', old.current_stock - new.current_stock,
          'avg_daily_usage', new.avg_daily_usage
        )
      );
    end if;

  -- ── Stock went UP (manual restock / adjustment) ─────────────────────────
  elsif new.current_stock > old.current_stock then
    insert into public.inventory_notifications
      (restaurant_id, inventory_item_id, type, severity, message, metadata)
    values (
      new.restaurant_id, new.id, 'restock', 'info',
      v_item_name || ' was restocked (+' || (new.current_stock - old.current_stock) || ')',
      jsonb_build_object('current_stock', new.current_stock, 'previous_stock', old.current_stock)
    );
  end if;

  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: delivery_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    area text,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    min_order numeric(10,2) DEFAULT 0 NOT NULL,
    estimated_time integer DEFAULT 30 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    center_lat double precision,
    center_lng double precision,
    radius_meters numeric,
    polygon jsonb
);


--
-- Name: fn_match_delivery_zone(uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_match_delivery_zone(p_restaurant_id uuid, p_lat double precision, p_lng double precision) RETURNS public.delivery_zones
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: fn_order_items_set_restaurant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_order_items_set_restaurant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_rid uuid;
begin
  select restaurant_id into v_rid from public.orders where id = new.order_id;
  if v_rid is not null then
    new.restaurant_id := v_rid;
  end if;
  return new;
end;
$$;


--
-- Name: fn_point_in_polygon(double precision, double precision, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_point_in_polygon(p_lat double precision, p_lng double precision, p_polygon jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
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


--
-- Name: fn_restock_inventory_item(uuid, numeric, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_restock_inventory_item(p_item_id uuid, p_new_stock numeric, p_batch_number text DEFAULT NULL::text, p_expiry_date date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.inventory_items
  set
    current_stock      = p_new_stock,
    last_restocked_at   = now(),
    batch_number        = coalesce(p_batch_number, batch_number),
    expiry_date         = coalesce(p_expiry_date, expiry_date)
  where id = p_item_id;
end;
$$;


--
-- Name: fn_staff_hash_pin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_staff_hash_pin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
begin
  if new.pin is not null and btrim(new.pin) <> '' then
    insert into public.staff_secrets (staff_id, restaurant_id, pin_hash, updated_at)
    values (new.id, new.restaurant_id, crypt(btrim(new.pin), gen_salt('bf', 6)), now())
    on conflict (staff_id) do update
      set pin_hash = excluded.pin_hash, restaurant_id = excluded.restaurant_id, updated_at = now();
  end if;
  new.pin := null;
  return new;
end $$;


--
-- Name: fn_waiter_call_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_waiter_call_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    insert into public.audit_logs (restaurant_id, staff_name, staff_role, action, entity_id, metadata)
    values (new.restaurant_id, 'Guest', 'guest', 'waiter_call', new.table_id::text,
            jsonb_build_object('table', new.table_number, 'table_name', new.table_name));
  end if;
  return null;
end $$;


--
-- Name: guest_assign_order_number(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_prefix text;
  v_num    int;
  v_ordnum text;
begin
  -- auth.uid() is null inside pos_send_to_kitchen / guest_place_delivery_order
  -- for a guest; those have already checked the restaurant themselves.
  if auth.uid() is not null
     and not (p_restaurant_id in (select public.user_restaurant_ids())) then
    raise exception 'guest_assign_order_number: not a member of this restaurant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.orders where id = p_order_id and restaurant_id = p_restaurant_id
  ) then
    raise exception 'order % not found for restaurant %', p_order_id, p_restaurant_id;
  end if;

  select prefix, coalesce(current_num, start_num, 1)
    into v_prefix, v_num
  from public.order_number_settings
  where restaurant_id = p_restaurant_id
  for update;

  if not found then
    insert into public.order_number_settings (restaurant_id, prefix, start_num, current_num, reset_period)
      values (p_restaurant_id, 'ORD-', 1, 2, 'never');
    v_prefix := 'ORD-';
    v_num := 1;
  else
    update public.order_number_settings
      set current_num = v_num + 1, updated_at = now()
      where restaurant_id = p_restaurant_id;
  end if;

  v_ordnum := coalesce(v_prefix, 'ORD-') || lpad(v_num::text, 3, '0');
  update public.orders set order_num = v_ordnum where id = p_order_id;
  return v_ordnum;
end $$;


--
-- Name: guest_num(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_num(p jsonb) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  select case jsonb_typeof(p)
    when 'number' then (p #>> '{}')::numeric
    when 'string' then case
      when btrim(p #>> '{}') = '' then 0
      when btrim(p #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p #>> '{}')::numeric
    end
  end
$_$;


--
-- Name: guest_order_items(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_order_items(p_order_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'item_name', i.item_name, 'qty', i.qty, 'status', i.status
         ) order by i.created_at), '[]'::jsonb)
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where i.order_id = p_order_id
    and o.created_at > now() - interval '24 hours'
$$;


--
-- Name: guest_place_delivery_order(uuid, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_place_delivery_order(p_restaurant_id uuid, p_items jsonb, p_customer jsonb, p_coupon_code text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s          jsonb;
  v_rows     jsonb;
  v_sub      numeric;
  v_free     numeric;
  v_fee      numeric;
  v_min      numeric;
  v_disc     numeric := 0;
  v_coupon   public.discount_codes;
  v_order_id uuid := gen_random_uuid();
  v_num      text;
  v_total    numeric;
  v_name     text := left(btrim(coalesce(p_customer->>'name', '')), 100);
  v_phone    text := left(btrim(coalesce(p_customer->>'phone', '')), 30);
  v_addr     text := nullif(left(btrim(coalesce(p_customer->>'address', '')), 500), '');
  v_selfie   text := nullif(btrim(coalesce(p_customer->>'selfie_url', '')), '');
  v_lat      numeric := public.guest_num(p_customer->'lat');
  v_lng      numeric := public.guest_num(p_customer->'lng');
begin
  select coalesce(r.settings, '{}'::jsonb) into s
    from public.restaurants r
   where r.id = p_restaurant_id and r.status = 'active';
  if not found then
    raise exception 'guest_place_delivery_order: restaurant not found' using errcode = '22023';
  end if;
  if s->'delivery_enabled' is distinct from 'true'::jsonb then
    raise exception 'guest_place_delivery_order: delivery is off' using errcode = '22023';
  end if;

  if v_name = '' or length(v_phone) < 5 then
    raise exception 'guest_place_delivery_order: name and phone are required' using errcode = '22023';
  end if;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'guest_place_delivery_order: location is required' using errcode = '22023';
  end if;
  if v_selfie is not null and (length(v_selfie) > 2000 or v_selfie !~ '^https://') then
    raise exception 'guest_place_delivery_order: bad selfie url' using errcode = '22023';
  end if;

  -- Flood guard: one phone can't stack up pending orders.
  if (select count(*) from public.delivery_orders d
      where d.restaurant_id = p_restaurant_id and d.customer_phone = v_phone
        and d.status = 'pending' and d.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'guest_place_delivery_order: too many pending orders' using errcode = '22023';
  end if;

  v_rows := public.guest_price_items(p_restaurant_id, p_items, 'delivery', ', ');
  select coalesce(sum((x->>'item_price')::numeric * (x->>'qty')::int), 0)
    into v_sub from jsonb_array_elements(v_rows) x;

  -- Same rules as the delivery page: flat fee, free above a threshold.
  v_free := public.guest_num(s->'free_delivery_above');
  v_fee  := case when v_free is not null and v_sub >= v_free then 0
                 else coalesce(public.guest_num(s->'default_delivery_fee'), 0) end;
  v_min  := coalesce(public.guest_num(s->'min_order_amount'), 0);
  if v_min > 0 and v_sub < v_min then
    raise exception 'guest_place_delivery_order: below the minimum order' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    select * into v_coupon
      from public.discount_codes d
     where d.restaurant_id = p_restaurant_id
       and d.active
       and lower(d.code) = lower(btrim(p_coupon_code))
     limit 1
     for update;
    if not found
       or (v_coupon.expires_at is not null and v_coupon.expires_at < now())
       or (v_coupon.max_uses is not null and coalesce(v_coupon.used_count, 0) >= v_coupon.max_uses)
       or (coalesce(v_coupon.min_order_amount, 0) > 0 and v_sub < v_coupon.min_order_amount) then
      raise exception 'guest_place_delivery_order: coupon not valid' using errcode = '22023';
    end if;
    v_disc := greatest(0, case when v_coupon.discount_type = 'percentage'
                               then least(v_sub * v_coupon.discount_value / 100, v_sub)
                               else least(v_coupon.discount_value, v_sub) end);
    update public.discount_codes set used_count = coalesce(used_count, 0) + 1 where id = v_coupon.id;
  end if;

  v_total := v_sub + v_fee - v_disc;

  insert into public.orders (id, restaurant_id, table_number, status, source, total)
  values (v_order_id, p_restaurant_id, 0, 'active', 'delivery', v_total);

  v_num := public.guest_assign_order_number(p_restaurant_id, v_order_id);

  insert into public.order_items (order_id, menu_item_id, item_name, item_price, qty, status, note, station_id)
  select v_order_id, (x->>'menu_item_id')::uuid, x->>'item_name', (x->>'item_price')::numeric,
         (x->>'qty')::int, 'pending', nullif(x->>'note', ''), null
    from jsonb_array_elements(v_rows) x;

  insert into public.delivery_orders
    (order_id, restaurant_id, customer_name, customer_phone, latitude, longitude,
     address_text, delivery_fee, status, selfie_url)
  values
    (v_order_id, p_restaurant_id, v_name, v_phone, v_lat, v_lng,
     v_addr, v_fee, 'pending', v_selfie);

  insert into public.audit_logs (restaurant_id, staff_name, staff_role, action, entity_id, metadata)
  values (
    p_restaurant_id, 'Customer', 'customer', 'delivery_order', v_order_id::text,
    jsonb_build_object(
      'customer',    v_name,
      'phone',       v_phone,
      'items_count', jsonb_array_length(v_rows),
      'items',       (select string_agg((x->>'qty') || '× ' || (x->>'item_name'), ', ')
                      from (select x from jsonb_array_elements(v_rows) x limit 3) first3),
      'address',     v_addr
    )
  );

  return jsonb_build_object(
    'order_id',     v_order_id,
    'order_num',    v_num,
    'subtotal',     v_sub,
    'delivery_fee', v_fee,
    'discount',     v_disc,
    'total',        v_total
  );
end $$;


--
-- Name: guest_price_items(uuid, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_price_items(p_restaurant_id uuid, p_items jsonb, p_channel text, p_note_sep text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $_$
declare
  e           jsonb;
  m           record;
  v_opts      uuid[];
  v_opt_n     int;
  v_opt_price numeric;
  v_opt_names text;
  v_qty       int;
  v_note      text;
  v_station   uuid;
  v_out       jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'guest order: no items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'guest order: too many items' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_items) loop
    select mi.id, mi.name, coalesce(mi.price, 0) as price, mi.delivery_price
      into m
      from public.menu_items mi
     where mi.id = (e->>'menu_item_id')::uuid
       and mi.restaurant_id = p_restaurant_id
       and coalesce(mi.available, true)
       and case p_channel
             when 'delivery' then coalesce(mi.available_delivery, true)
             else                 coalesce(mi.available_guest, true)
           end;
    if not found then
      raise exception 'guest order: item not available' using errcode = '22023';
    end if;

    v_qty := case when (e->>'qty') ~ '^[0-9]{1,3}$' then (e->>'qty')::int end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'guest order: bad quantity' using errcode = '22023';
    end if;

    v_opts := array(
      select distinct x::uuid
      from jsonb_array_elements_text(
        case when jsonb_typeof(e->'option_ids') = 'array' then e->'option_ids' else '[]'::jsonb end
      ) x
    );

    select count(*), coalesce(sum(o.price), 0),
           string_agg(o.name, p_note_sep order by mm.sort_order nulls last, o.sort_order nulls last)
      into v_opt_n, v_opt_price, v_opt_names
      from public.modifier_options o
      left join public.menu_modifiers mm on mm.id = o.modifier_id
     where o.id = any(v_opts)
       and exists (select 1 from public.menu_item_modifiers l
                   where l.item_id = m.id and l.modifier_id = o.modifier_id);
    if v_opt_n <> coalesce(array_length(v_opts, 1), 0) then
      raise exception 'guest order: option not available for this item' using errcode = '22023';
    end if;

    v_note := nullif(left(btrim(coalesce(e->>'note', '')), 300), '');
    v_note := nullif(concat_ws(p_note_sep, v_opt_names, v_note), '');

    -- KDS routing is computed in the browser; keep it only if it's this
    -- restaurant's station.
    v_station := null;
    if nullif(e->>'station_id', '') is not null then
      select ks.id into v_station
        from public.kds_stations ks
       where ks.id = (e->>'station_id')::uuid and ks.restaurant_id = p_restaurant_id;
    end if;

    v_out := v_out || jsonb_build_object(
      'menu_item_id', m.id,
      'item_name',    m.name,
      'item_price',   (case when p_channel = 'delivery' then coalesce(m.delivery_price, m.price) else m.price end) + v_opt_price,
      'qty',          v_qty,
      'note',         v_note,
      'station_id',   v_station
    );
  end loop;

  return v_out;
end $_$;


--
-- Name: guest_track_delivery_orders(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_track_delivery_orders(p_restaurant_id uuid, p_phone text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select
      d.id, d.order_id, d.customer_name, d.address_text, d.delivery_fee,
      d.status, d.created_at,
      o.order_num as order_number, o.status as order_status, o.total,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_name', oi.item_name, 'qty', oi.qty, 'item_price', oi.item_price
        ))
        from public.order_items oi where oi.order_id = d.order_id
      ), '[]'::jsonb) as items
    from public.delivery_orders d
    left join public.orders o on o.id = d.order_id
    where d.restaurant_id = p_restaurant_id
      and d.customer_phone = p_phone
    order by d.created_at desc
    limit 10
  ) t
$$;


--
-- Name: guest_validate_discount_code(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guest_validate_discount_code(p_restaurant_id uuid, p_code text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select to_jsonb(d)
  from public.discount_codes d
  where d.restaurant_id = p_restaurant_id
    and d.active
    and lower(d.code) = lower(btrim(p_code))
  limit 1
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'owner');
  return new;
end $$;


--
-- Name: pos_send_to_kitchen(uuid, integer, integer, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pos_send_to_kitchen(p_restaurant_id uuid, p_table_number integer, p_guests integer, p_items jsonb, p_source text DEFAULT 'staff'::text, p_item_status text DEFAULT 'sent'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_guest     boolean := auth.uid() is null;
  v_table     record;
  v_rows      jsonb;
  v_order_id  uuid;
  v_order_num text;
  v_is_new    boolean := false;
  v_items     jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'pos_send_to_kitchen: no items supplied';
  end if;
  if p_item_status not in ('sent', 'pending') then
    raise exception 'pos_send_to_kitchen: bad item status %', p_item_status;
  end if;

  if v_guest then
    -- anon = a guest on the QR menu: pending items for staff approval, on a
    -- real table, priced from the menu.
    if coalesce(p_source, '') <> 'guest' or p_item_status <> 'pending' then
      raise exception 'pos_send_to_kitchen: sign in required' using errcode = '42501';
    end if;
    select t.table_number, t.name into v_table
      from public.tables t
     where t.restaurant_id = p_restaurant_id
       and t.seq = p_table_number
       and coalesce(t.active, true)
     limit 1;
    if not found then
      raise exception 'pos_send_to_kitchen: unknown table' using errcode = '22023';
    end if;
    v_rows := public.guest_price_items(p_restaurant_id, p_items, 'guest', ' · ');
  else
    if not (p_restaurant_id in (select public.user_restaurant_ids())) then
      raise exception 'pos_send_to_kitchen: not a member of this restaurant' using errcode = '42501';
    end if;
    v_rows := p_items;
  end if;

  -- Everyone hitting this table lines up here. Released at commit/rollback.
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text), p_table_number);

  select id into v_order_id
  from public.orders
  where restaurant_id = p_restaurant_id
    and table_number  = p_table_number
    and status        = 'active'
  order by created_at desc
  limit 1;

  if v_guest and v_order_id is not null and (
    select count(*) from public.order_items
    where order_id = v_order_id and status = 'pending'
  ) >= 100 then
    raise exception 'pos_send_to_kitchen: too many pending items on this table' using errcode = '22023';
  end if;

  if v_order_id is null then
    insert into public.orders (restaurant_id, table_number, guests, status, source, total)
    values (p_restaurant_id, p_table_number, coalesce(p_guests, 0),
            'active', case when v_guest then 'guest' else coalesce(p_source, 'staff') end, 0)
    returning id into v_order_id;
    v_is_new := true;
  end if;

  -- A fresh number on every send — one physical ticket, one number.
  v_order_num := public.guest_assign_order_number(p_restaurant_id, v_order_id);

  with ins as (
    insert into public.order_items
      (order_id, menu_item_id, item_name, item_price, qty, status, sent_at, note, station_id)
    select
      v_order_id,
      nullif(e->>'menu_item_id', '')::uuid,
      e->>'item_name',
      (e->>'item_price')::numeric,
      coalesce((e->>'qty')::int, 1),
      p_item_status,
      case when p_item_status = 'sent' then now() end,
      nullif(e->>'note', ''),
      nullif(e->>'station_id', '')::uuid
    from jsonb_array_elements(v_rows) as e
    returning id, item_name, item_price, qty, status, note
  )
  select jsonb_agg(to_jsonb(ins)) into v_items from ins;

  if v_guest then
    insert into public.audit_logs (restaurant_id, staff_name, staff_role, action, entity_id, metadata)
    values (
      p_restaurant_id, 'Guest', 'guest', 'guest_order', v_order_id::text,
      jsonb_build_object(
        'table',       coalesce(nullif(v_table.table_number::text, ''), p_table_number::text),
        'table_name',  nullif(v_table.name, ''),
        'items_count', jsonb_array_length(v_rows),
        'items',       (select string_agg((x->>'qty') || '× ' || (x->>'item_name'), ', ')
                        from (select x from jsonb_array_elements(v_rows) x limit 3) first3)
      )
    );
  end if;

  -- total was just refreshed by trg_recalc_order_total — read it back.
  return jsonb_build_object(
    'order_id',  v_order_id,
    'order_num', v_order_num,
    'is_new',    v_is_new,
    'items',     coalesce(v_items, '[]'::jsonb),
    'total',     (select total from public.orders where id = v_order_id)
  );
end $$;


--
-- Name: purge_old_audit_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_old_audit_logs() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '7 days';
  RETURN NEW;
END;
$$;


--
-- Name: recalc_order_total(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalc_order_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  oid uuid;
begin
  -- A single row write can touch two orders: moving an item between tables
  -- changes order_id, so OLD and NEW point at different parents. Recompute
  -- every distinct one this row belonged to.
  for oid in
    select distinct v.x
    from (values (new.order_id), (old.order_id)) as v(x)
    where v.x is not null
  loop
    -- Serialise concurrent item writes for this order here, so two waiters
    -- ringing into the same table can't both compute a total from a partial
    -- view and race the UPDATE.
    perform 1 from public.orders where id = oid for update;

    update public.orders o
       set total = coalesce((
             select sum(oi.item_price * oi.qty)
             from public.order_items oi
             where oi.order_id = oid and oi.status <> 'void'
           ), 0),
           updated_at = now()
     where o.id = oid
       and o.status = 'active'                       -- frozen once paid/void/cancelled…
       and coalesce(o.source, 'staff') <> 'delivery'; -- …and delivery owns its own total
  end loop;

  return null;  -- AFTER trigger — result ignored
end $$;


--
-- Name: security_policy_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.security_policy_report() RETURNS TABLE(table_name text, rls_enabled boolean, policy_name text, roles text[], cmd text, qual text, with_check text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select c.relname::text, c.relrowsecurity, p.policyname::text,
         p.roles::text[], p.cmd, p.qual, p.with_check
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  order by 1, 3
$$;


--
-- Name: security_trigger_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.security_trigger_report() RETURNS TABLE(table_name text, trigger_name text, function_name text, security_definer boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  select c.relname::text, t.tgname::text, p.proname::text, p.prosecdef
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p      on p.oid = t.tgfoid
  where n.nspname = 'public' and not t.tgisinternal
  order by 1, 2
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: staff_pin_match(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_pin_match(p_restaurant_id uuid, p_pin text) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select coalesce(array_agg(s.staff_id), '{}')
  from public.staff_secrets s
  where s.restaurant_id = p_restaurant_id
    and s.pin_hash = crypt(btrim(p_pin), s.pin_hash)
$$;


--
-- Name: storage_path_restaurant(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_path_restaurant(p_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  select case
    when f[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then f[1]::uuid
    when f[1] in ('events', 'expenses', 'receipt')
     and f[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then f[2]::uuid
  end
  from (select storage.foldername(p_name) as f) x
$_$;


--
-- Name: strip_restaurant_settings_secrets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.strip_restaurant_settings_secrets() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.settings is not null then
    new.settings := new.settings - 'password' - 'owner_pin';
  end if;
  return new;
end;
$$;


--
-- Name: user_restaurant_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_restaurant_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select restaurant_id from public.restaurant_users where user_id = auth.uid()
  union
  select id            from public.restaurants     where owner_id = auth.uid()
$$;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    staff_id text,
    staff_name text,
    staff_role text,
    action text NOT NULL,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: combo_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.combo_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    buy_qty integer DEFAULT 2,
    get_qty integer DEFAULT 1,
    discount_pct numeric(5,2) DEFAULT 100,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    decimal_places integer DEFAULT 2,
    is_default boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    order_id uuid,
    table_num text,
    rating smallint,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    birthday date,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    blacklisted boolean DEFAULT false NOT NULL,
    visit_count integer DEFAULT 0 NOT NULL,
    total_spent numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT customers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: delivery_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    delivery_order_id uuid NOT NULL,
    recipient_type text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_notifications_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['customer'::text, 'restaurant'::text, 'driver'::text]))),
    CONSTRAINT delivery_notifications_type_check CHECK ((type = ANY (ARRAY['order_placed'::text, 'status_changed'::text, 'driver_assigned'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: delivery_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    restaurant_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    latitude numeric(10,7),
    longitude numeric(10,7),
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    address_text text,
    driver_id uuid,
    driver_name text,
    selfie_url text
);


--
-- Name: discount_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    code text NOT NULL,
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    min_order_amount numeric(10,2) DEFAULT 0 NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discount_codes_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text])))
);


--
-- Name: discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'percentage'::text,
    value numeric(10,2) DEFAULT 0,
    min_order numeric(10,2) DEFAULT 0,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT discounts_type_check CHECK ((type = ANY (ARRAY['percentage'::text, 'fixed'::text])))
);


--
-- Name: events_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    date_label text,
    image_url text,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    title text NOT NULL,
    category_id text,
    amount numeric(12,3) DEFAULT 0 NOT NULL,
    payment_method text,
    status text DEFAULT 'paid'::text NOT NULL,
    receipt_url text,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'pending'::text, 'scheduled'::text])))
);


--
-- Name: floor_elements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.floor_elements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    group_id uuid,
    kind text NOT NULL,
    x real DEFAULT 0 NOT NULL,
    y real DEFAULT 0 NOT NULL,
    w real DEFAULT 60 NOT NULL,
    h real DEFAULT 60 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rot smallint DEFAULT 0 NOT NULL
);


--
-- Name: inventory_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#10b981'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    category_id uuid,
    unit_id uuid,
    name text NOT NULL,
    sku text,
    current_stock numeric DEFAULT 0 NOT NULL,
    min_stock numeric DEFAULT 0 NOT NULL,
    cost_price numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expiry_date date,
    batch_number text,
    last_restocked_at timestamp with time zone,
    avg_daily_usage numeric DEFAULT 0 NOT NULL,
    usage_updated_at timestamp with time zone
);


--
-- Name: inventory_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    inventory_item_id uuid,
    type text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_notifications_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))),
    CONSTRAINT inventory_notifications_type_check CHECK ((type = ANY (ARRAY['low_stock'::text, 'out_of_stock'::text, 'expiring_soon'::text, 'expired'::text, 'rapid_depletion'::text, 'restock'::text, 'manual_adjustment'::text])))
);


--
-- Name: inventory_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    abbreviation text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_number_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_number_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    prefix text DEFAULT 'INV-'::text,
    start_num integer DEFAULT 1001,
    current_num integer DEFAULT 1001,
    reset_period text DEFAULT 'never'::text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT invoice_number_settings_reset_period_check CHECK ((reset_period = ANY (ARRAY['never'::text, 'daily'::text, 'monthly'::text, 'yearly'::text])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    invoice_num text NOT NULL,
    order_num text,
    table_num text,
    guests integer DEFAULT 0,
    cashier text,
    payment_method text,
    items jsonb,
    subtotal numeric(10,2) DEFAULT 0,
    discount numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    amount_paid numeric(10,2) DEFAULT 0,
    change_amount numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    customer_id uuid,
    customer_name text,
    customer_phone text,
    order_id uuid,
    tip_amount numeric(10,2) DEFAULT 0
);


--
-- Name: kds_station_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kds_station_categories (
    station_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: kds_stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kds_stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#f59e0b'::text,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: kitchen_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kitchen_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    text text NOT NULL,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    date_of_birth date,
    points integer DEFAULT 0 NOT NULL,
    tier text DEFAULT 'bronze'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    birthday date,
    CONSTRAINT members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#f59e0b'::text,
    sort_order integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    icon text,
    station_id uuid
);


--
-- Name: menu_item_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    inventory_item_id uuid NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: menu_item_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_item_modifiers (
    item_id uuid NOT NULL,
    modifier_id uuid NOT NULL
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    category_id uuid,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0,
    available boolean DEFAULT true,
    has_modifiers boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    image_url text,
    cost numeric DEFAULT 0 NOT NULL,
    available_delivery boolean DEFAULT true NOT NULL,
    available_guest boolean DEFAULT true NOT NULL,
    delivery_price numeric
);


--
-- Name: menu_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    required boolean DEFAULT false,
    min_select integer DEFAULT 0,
    max_select integer DEFAULT 1,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: menu_template_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_template_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    template text DEFAULT 'classic'::text NOT NULL,
    primary_color text DEFAULT '#f59e0b'::text NOT NULL,
    show_prices boolean DEFAULT true NOT NULL,
    show_descriptions boolean DEFAULT true NOT NULL,
    welcome_text text,
    updated_at timestamp with time zone DEFAULT now(),
    base_theme text DEFAULT 'light'::text,
    surface_style text DEFAULT 'solid'::text,
    cat_style text DEFAULT 'circles'::text,
    item_style text DEFAULT 'grid'::text,
    event_style text DEFAULT 'carousel'::text,
    social_style text DEFAULT 'pills'::text,
    category_style text DEFAULT 'circles'::text,
    menu_enabled boolean DEFAULT true NOT NULL,
    face_scan_enabled boolean DEFAULT true NOT NULL,
    order_hours_enabled boolean DEFAULT false NOT NULL,
    order_open_time text DEFAULT '10:00'::text NOT NULL,
    order_close_time text DEFAULT '23:00'::text NOT NULL
);


--
-- Name: modifier_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modifier_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modifier_id uuid NOT NULL,
    name text NOT NULL,
    price numeric(10,2) DEFAULT 0,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    item_name text NOT NULL,
    item_price numeric(10,2) NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    note text,
    void_reason text,
    voided_by text,
    sent_at timestamp with time zone,
    cooking_started_at timestamp with time zone,
    ready_at timestamp with time zone,
    station_id uuid,
    menu_item_id uuid,
    restaurant_id uuid,
    CONSTRAINT order_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'cooking'::text, 'ready'::text, 'void'::text])))
);


--
-- Name: order_number_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_number_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    prefix text DEFAULT 'ORD-'::text,
    start_num integer DEFAULT 1,
    current_num integer DEFAULT 1,
    reset_period text DEFAULT 'daily'::text,
    show_receipt boolean DEFAULT true,
    show_kds boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT order_number_settings_reset_period_check CHECK ((reset_period = ANY (ARRAY['never'::text, 'daily'::text, 'shift'::text])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_number integer NOT NULL,
    guests integer DEFAULT 0,
    status text DEFAULT 'active'::text NOT NULL,
    note text,
    total numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_method text,
    amount_paid numeric(10,2) DEFAULT 0,
    change_amount numeric(10,2) DEFAULT 0,
    paid_at timestamp with time zone,
    order_num text,
    source text DEFAULT 'staff'::text,
    customer_name text,
    customer_phone text,
    print_count integer DEFAULT 0 NOT NULL,
    last_printed_at timestamp with time zone,
    print_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT orders_source_check CHECK ((source = ANY (ARRAY['guest'::text, 'staff'::text, 'delivery'::text, 'takeout'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paid'::text, 'closed'::text, 'cancelled'::text])))
);


--
-- Name: pay_later; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_later (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    customer_name text NOT NULL,
    customer_phone text,
    order_ref text,
    table_num text,
    original_amount numeric(12,3) DEFAULT 0 NOT NULL,
    paid_amount numeric(12,3) DEFAULT 0 NOT NULL,
    due_date date,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pay_later_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text])))
);


--
-- Name: pay_later_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_later_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pay_later_id uuid NOT NULL,
    amount numeric(12,3) NOT NULL,
    payment_method text,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    icon_type text DEFAULT 'cash'::text,
    active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    billing_period text DEFAULT 'monthly'::text NOT NULL,
    description text,
    color text DEFAULT 'indigo'::text NOT NULL,
    modules jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: printer_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printer_categories (
    printer_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: printers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.printers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    purpose text DEFAULT 'receipt'::text,
    connection_type text DEFAULT 'ip'::text,
    ip_address text,
    port integer DEFAULT 9100,
    bt_address text,
    usb_path text,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    paper_width integer DEFAULT 80,
    purposes text[] DEFAULT ARRAY['receipt'::text] NOT NULL,
    CONSTRAINT printers_connection_type_check CHECK ((connection_type = ANY (ARRAY['ip'::text, 'bluetooth'::text, 'usb'::text]))),
    CONSTRAINT printers_purpose_check CHECK ((purpose = ANY (ARRAY['receipt'::text, 'kitchen'::text, 'label'::text, 'bar'::text, 'report'::text, 'reprint'::text]))),
    CONSTRAINT printers_purposes_valid CHECK (((purposes <@ ARRAY['receipt'::text, 'kitchen'::text, 'label'::text, 'bar'::text, 'report'::text, 'reprint'::text]) AND (cardinality(purposes) >= 1)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'owner'::text NOT NULL,
    restaurant_id uuid,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['seller'::text, 'owner'::text, 'manager'::text, 'cashier'::text, 'waiter'::text, 'chef'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    endpoint text NOT NULL,
    subscription jsonb,
    created_at timestamp with time zone DEFAULT now(),
    type text DEFAULT 'web'::text NOT NULL,
    staff_id uuid
);


--
-- Name: receipt_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    shop_name text,
    logo_url text,
    phone text,
    address text,
    thank_you_msg text DEFAULT 'Thank you for your visit!'::text,
    footer_note text DEFAULT 'Powered by ClickGroup System'::text,
    currency_symbol text DEFAULT '$'::text,
    show_qr boolean DEFAULT true,
    qr_url text,
    show_logo boolean DEFAULT true,
    show_address boolean DEFAULT true,
    show_phone boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    language character varying(5) DEFAULT 'ku'::character varying NOT NULL,
    warning_msg text,
    show_warning boolean DEFAULT false NOT NULL
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid,
    guest_name text NOT NULL,
    guest_phone text,
    guest_email text,
    party_size integer DEFAULT 2 NOT NULL,
    date date NOT NULL,
    "time" time without time zone NOT NULL,
    table_id uuid,
    table_label text,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reservations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'seated'::text, 'cancelled'::text, 'no_show'::text])))
);


--
-- Name: restaurants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    owner_id uuid,
    status text DEFAULT 'trial'::text NOT NULL,
    plan text DEFAULT 'starter'::text NOT NULL,
    address text,
    phone text,
    email text,
    logo_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    menu_slug text DEFAULT lower(substr(encode(extensions.gen_random_bytes(6), 'hex'::text), 1, 8)) NOT NULL,
    CONSTRAINT restaurants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'trial'::text, 'expired'::text])))
);


--
-- Name: restaurant_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.restaurant_public AS
 SELECT id,
    name,
    logo_url,
    menu_slug,
    (settings ->> 'currency'::text) AS currency,
    (settings ->> 'default_language'::text) AS default_language,
    COALESCE(( SELECT jsonb_object_agg(e.key, e.value) AS jsonb_object_agg
           FROM jsonb_each(COALESCE(r.settings, '{}'::jsonb)) e(key, value)
          WHERE (e.key = ANY (ARRAY['facebook'::text, 'instagram'::text, 'snapchat'::text, 'whatsapp'::text, 'tiktok'::text, 'twitter'::text, 'youtube'::text, 'maps_url'::text, 'website'::text, 'delivery_enabled'::text, 'default_delivery_fee'::text, 'min_order_amount'::text, 'estimated_delivery_time'::text, 'free_delivery_above'::text, 'delivery_note'::text, 'show_delivery_button'::text, 'dine_in_note'::text, 'show_call_waiter'::text, 'enable_qr_ordering'::text]))), '{}'::jsonb) AS settings
   FROM public.restaurants r;


--
-- Name: restaurant_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: restaurant_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_secrets (
    restaurant_id uuid NOT NULL,
    password_hash text,
    owner_pin_hash text,
    auth_secret text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: restaurant_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'waiter'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    role_id uuid,
    CONSTRAINT restaurant_users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'cashier'::text, 'waiter'::text, 'chef'::text])))
);


--
-- Name: role_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    target_role text,
    message text NOT NULL,
    sender_name text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'waiter'::text NOT NULL,
    pin text,
    color text DEFAULT 'from-amber-500 to-orange-500'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    role_id uuid NOT NULL,
    CONSTRAINT staff_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'cashier'::text, 'waiter'::text, 'chef'::text]))),
    CONSTRAINT staff_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: staff_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_secrets (
    staff_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    pin_hash text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: surcharges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surcharges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'percentage'::text,
    value numeric(10,2) DEFAULT 0,
    applied_to text DEFAULT 'All'::text,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT surcharges_type_check CHECK ((type = ANY (ARRAY['percentage'::text, 'fixed'::text])))
);


--
-- Name: table_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: table_recoveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_recoveries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    restaurant_id uuid NOT NULL,
    invoice_num text NOT NULL,
    order_num text,
    table_num text NOT NULL,
    recovered_by text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    group_id uuid,
    seq integer NOT NULL,
    table_number text NOT NULL,
    name text,
    capacity integer DEFAULT 4,
    shape text DEFAULT 'Square'::text,
    sort_order integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'available'::text NOT NULL,
    pos_x real,
    pos_y real,
    CONSTRAINT tables_shape_check CHECK ((shape = ANY (ARRAY['Square'::text, 'Round'::text, 'Rectangle'::text]))),
    CONSTRAINT tables_status_check CHECK ((status = ANY (ARRAY['available'::text, 'dirty'::text])))
);


--
-- Name: void_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.void_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    text text NOT NULL,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: waiter_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waiter_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    table_id uuid,
    table_number text NOT NULL,
    table_name text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT waiter_calls_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'acknowledged'::text])))
);


--
-- Name: whatsapp_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    message text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    restaurant_id uuid NOT NULL,
    name text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: combo_discounts combo_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combo_discounts
    ADD CONSTRAINT combo_discounts_pkey PRIMARY KEY (id);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);


--
-- Name: customer_feedback customer_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_feedback
    ADD CONSTRAINT customer_feedback_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: delivery_notifications delivery_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notifications
    ADD CONSTRAINT delivery_notifications_pkey PRIMARY KEY (id);


--
-- Name: delivery_orders delivery_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_pkey PRIMARY KEY (id);


--
-- Name: delivery_zones delivery_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_zones
    ADD CONSTRAINT delivery_zones_pkey PRIMARY KEY (id);


--
-- Name: discount_codes discount_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_pkey PRIMARY KEY (id);


--
-- Name: discount_codes discount_codes_restaurant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_restaurant_id_code_key UNIQUE (restaurant_id, code);


--
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);


--
-- Name: events_offers events_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_offers
    ADD CONSTRAINT events_offers_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: floor_elements floor_elements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floor_elements
    ADD CONSTRAINT floor_elements_pkey PRIMARY KEY (id);


--
-- Name: inventory_categories inventory_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_notifications inventory_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_notifications
    ADD CONSTRAINT inventory_notifications_pkey PRIMARY KEY (id);


--
-- Name: inventory_units inventory_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_pkey PRIMARY KEY (id);


--
-- Name: invoice_number_settings invoice_number_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_number_settings
    ADD CONSTRAINT invoice_number_settings_pkey PRIMARY KEY (id);


--
-- Name: invoice_number_settings invoice_number_settings_restaurant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_number_settings
    ADD CONSTRAINT invoice_number_settings_restaurant_id_key UNIQUE (restaurant_id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: kds_station_categories kds_station_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_pkey PRIMARY KEY (station_id, category_id);


--
-- Name: kds_stations kds_stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_stations
    ADD CONSTRAINT kds_stations_pkey PRIMARY KEY (id);


--
-- Name: kitchen_notes kitchen_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_notes
    ADD CONSTRAINT kitchen_notes_pkey PRIMARY KEY (id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_item_ingredients menu_item_ingredients_menu_item_id_inventory_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_menu_item_id_inventory_item_id_key UNIQUE (menu_item_id, inventory_item_id);


--
-- Name: menu_item_ingredients menu_item_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_pkey PRIMARY KEY (id);


--
-- Name: menu_item_modifiers menu_item_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_pkey PRIMARY KEY (item_id, modifier_id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: menu_modifiers menu_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_modifiers
    ADD CONSTRAINT menu_modifiers_pkey PRIMARY KEY (id);


--
-- Name: menu_template_settings menu_template_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_template_settings
    ADD CONSTRAINT menu_template_settings_pkey PRIMARY KEY (id);


--
-- Name: menu_template_settings menu_template_settings_restaurant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_template_settings
    ADD CONSTRAINT menu_template_settings_restaurant_id_key UNIQUE (restaurant_id);


--
-- Name: modifier_options modifier_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modifier_options
    ADD CONSTRAINT modifier_options_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_number_settings order_number_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_number_settings
    ADD CONSTRAINT order_number_settings_pkey PRIMARY KEY (id);


--
-- Name: order_number_settings order_number_settings_restaurant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_number_settings
    ADD CONSTRAINT order_number_settings_restaurant_id_key UNIQUE (restaurant_id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: pay_later_payments pay_later_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_later_payments
    ADD CONSTRAINT pay_later_payments_pkey PRIMARY KEY (id);


--
-- Name: pay_later pay_later_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_later
    ADD CONSTRAINT pay_later_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: plans plans_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_slug_key UNIQUE (slug);


--
-- Name: printer_categories printer_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printer_categories
    ADD CONSTRAINT printer_categories_pkey PRIMARY KEY (printer_id, category_id);


--
-- Name: printers printers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: receipt_settings receipt_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_settings
    ADD CONSTRAINT receipt_settings_pkey PRIMARY KEY (id);


--
-- Name: receipt_settings receipt_settings_restaurant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_settings
    ADD CONSTRAINT receipt_settings_restaurant_id_key UNIQUE (restaurant_id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: restaurant_roles restaurant_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_roles
    ADD CONSTRAINT restaurant_roles_pkey PRIMARY KEY (id);


--
-- Name: restaurant_secrets restaurant_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_secrets
    ADD CONSTRAINT restaurant_secrets_pkey PRIMARY KEY (restaurant_id);


--
-- Name: restaurant_users restaurant_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_users
    ADD CONSTRAINT restaurant_users_pkey PRIMARY KEY (id);


--
-- Name: restaurant_users restaurant_users_restaurant_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_users
    ADD CONSTRAINT restaurant_users_restaurant_id_user_id_key UNIQUE (restaurant_id, user_id);


--
-- Name: restaurants restaurants_menu_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_menu_slug_key UNIQUE (menu_slug);


--
-- Name: restaurants restaurants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_pkey PRIMARY KEY (id);


--
-- Name: role_messages role_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_messages
    ADD CONSTRAINT role_messages_pkey PRIMARY KEY (id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: staff_secrets staff_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_secrets
    ADD CONSTRAINT staff_secrets_pkey PRIMARY KEY (staff_id);


--
-- Name: surcharges surcharges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surcharges
    ADD CONSTRAINT surcharges_pkey PRIMARY KEY (id);


--
-- Name: table_groups table_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_groups
    ADD CONSTRAINT table_groups_pkey PRIMARY KEY (id);


--
-- Name: table_recoveries table_recoveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_recoveries
    ADD CONSTRAINT table_recoveries_pkey PRIMARY KEY (id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: void_reasons void_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.void_reasons
    ADD CONSTRAINT void_reasons_pkey PRIMARY KEY (id);


--
-- Name: waiter_calls waiter_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_logs whatsapp_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_logs
    ADD CONSTRAINT whatsapp_logs_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_restaurant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_restaurant_idx ON public.audit_logs USING btree (restaurant_id, created_at DESC);


--
-- Name: expenses_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_created_at_idx ON public.expenses USING btree (created_at DESC);


--
-- Name: expenses_restaurant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_restaurant_id_idx ON public.expenses USING btree (restaurant_id);


--
-- Name: idx_combo_discounts_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_combo_discounts_restaurant ON public.combo_discounts USING btree (restaurant_id);


--
-- Name: idx_currencies_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_currencies_restaurant ON public.currencies USING btree (restaurant_id);


--
-- Name: idx_customer_feedback_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_feedback_created ON public.customer_feedback USING btree (created_at DESC);


--
-- Name: idx_customer_feedback_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_feedback_restaurant ON public.customer_feedback USING btree (restaurant_id);


--
-- Name: idx_customer_feedback_restaurant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_feedback_restaurant_created ON public.customer_feedback USING btree (restaurant_id, created_at DESC);


--
-- Name: idx_delivery_notif_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notif_order ON public.delivery_notifications USING btree (delivery_order_id, created_at DESC);


--
-- Name: idx_delivery_notif_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notif_recipient ON public.delivery_notifications USING btree (recipient_type, is_read);


--
-- Name: idx_delivery_notif_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_notif_restaurant ON public.delivery_notifications USING btree (restaurant_id, created_at DESC);


--
-- Name: idx_delivery_zones_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_zones_active ON public.delivery_zones USING btree (restaurant_id, active, sort_order);


--
-- Name: idx_discounts_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discounts_restaurant ON public.discounts USING btree (restaurant_id);


--
-- Name: idx_floor_elements_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_floor_elements_restaurant ON public.floor_elements USING btree (restaurant_id);


--
-- Name: idx_inv_notif_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_notif_item ON public.inventory_notifications USING btree (inventory_item_id);


--
-- Name: idx_inv_notif_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_notif_restaurant ON public.inventory_notifications USING btree (restaurant_id, created_at DESC);


--
-- Name: idx_inv_notif_restaurant_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_notif_restaurant_unread ON public.inventory_notifications USING btree (restaurant_id, is_read) WHERE (is_read = false);


--
-- Name: idx_inventory_categories_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_categories_restaurant ON public.inventory_categories USING btree (restaurant_id);


--
-- Name: idx_inventory_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_category ON public.inventory_items USING btree (category_id);


--
-- Name: idx_inventory_items_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_expiry ON public.inventory_items USING btree (expiry_date) WHERE (expiry_date IS NOT NULL);


--
-- Name: idx_inventory_items_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_items_restaurant ON public.inventory_items USING btree (restaurant_id);


--
-- Name: idx_inventory_units_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_units_restaurant ON public.inventory_units USING btree (restaurant_id);


--
-- Name: idx_invoices_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_created_at ON public.invoices USING btree (created_at);


--
-- Name: idx_invoices_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_order_id ON public.invoices USING btree (order_id);


--
-- Name: idx_invoices_order_num; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_order_num ON public.invoices USING btree (order_num) WHERE (order_num IS NOT NULL);


--
-- Name: idx_invoices_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_restaurant ON public.invoices USING btree (restaurant_id);


--
-- Name: idx_kds_station_categories_station_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_station_categories_station_id ON public.kds_station_categories USING btree (station_id);


--
-- Name: idx_kds_stations_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_stations_restaurant ON public.kds_stations USING btree (restaurant_id);


--
-- Name: idx_kitchen_notes_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kitchen_notes_restaurant ON public.kitchen_notes USING btree (restaurant_id);


--
-- Name: idx_menu_categories_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_categories_restaurant ON public.menu_categories USING btree (restaurant_id);


--
-- Name: idx_menu_item_ingredients_inv_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_ingredients_inv_item ON public.menu_item_ingredients USING btree (inventory_item_id);


--
-- Name: idx_menu_item_ingredients_menu_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_ingredients_menu_item ON public.menu_item_ingredients USING btree (menu_item_id);


--
-- Name: idx_menu_item_ingredients_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_ingredients_restaurant ON public.menu_item_ingredients USING btree (restaurant_id);


--
-- Name: idx_menu_item_modifiers_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_modifiers_item_id ON public.menu_item_modifiers USING btree (item_id);


--
-- Name: idx_menu_item_modifiers_modifier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_item_modifiers_modifier_id ON public.menu_item_modifiers USING btree (modifier_id);


--
-- Name: idx_menu_items_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_category ON public.menu_items USING btree (category_id);


--
-- Name: idx_menu_items_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_restaurant ON public.menu_items USING btree (restaurant_id);


--
-- Name: idx_menu_modifiers_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_modifiers_restaurant ON public.menu_modifiers USING btree (restaurant_id);


--
-- Name: idx_modifier_options_modifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modifier_options_modifier ON public.modifier_options USING btree (modifier_id);


--
-- Name: idx_modifier_options_modifier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modifier_options_modifier_id ON public.modifier_options USING btree (modifier_id);


--
-- Name: idx_order_items_menu_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_menu_item_id ON public.order_items USING btree (menu_item_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_order_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_status ON public.order_items USING btree (order_id, status);


--
-- Name: idx_order_items_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_restaurant_id ON public.order_items USING btree (restaurant_id);


--
-- Name: idx_orders_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_restaurant_id ON public.orders USING btree (restaurant_id);


--
-- Name: idx_orders_restaurant_table_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_restaurant_table_status ON public.orders USING btree (restaurant_id, table_number, status);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_payment_methods_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_methods_restaurant ON public.payment_methods USING btree (restaurant_id);


--
-- Name: idx_printers_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_printers_restaurant ON public.printers USING btree (restaurant_id);


--
-- Name: idx_profiles_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_restaurant_id ON public.profiles USING btree (restaurant_id);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_push_subs_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subs_staff ON public.push_subscriptions USING btree (staff_id) WHERE (staff_id IS NOT NULL);


--
-- Name: idx_restaurant_roles_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_roles_restaurant ON public.restaurant_roles USING btree (restaurant_id);


--
-- Name: idx_restaurant_users_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_users_restaurant_id ON public.restaurant_users USING btree (restaurant_id);


--
-- Name: idx_restaurant_users_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurant_users_user_id ON public.restaurant_users USING btree (user_id);


--
-- Name: idx_restaurants_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurants_owner_id ON public.restaurants USING btree (owner_id);


--
-- Name: idx_restaurants_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_restaurants_status ON public.restaurants USING btree (status);


--
-- Name: idx_staff_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_restaurant_id ON public.staff USING btree (restaurant_id);


--
-- Name: idx_staff_secrets_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_secrets_restaurant ON public.staff_secrets USING btree (restaurant_id);


--
-- Name: idx_surcharges_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_surcharges_restaurant ON public.surcharges USING btree (restaurant_id);


--
-- Name: idx_table_groups_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_groups_restaurant ON public.table_groups USING btree (restaurant_id);


--
-- Name: idx_tables_restaurant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_restaurant_id ON public.tables USING btree (restaurant_id);


--
-- Name: idx_void_reasons_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_void_reasons_restaurant ON public.void_reasons USING btree (restaurant_id);


--
-- Name: idx_waiter_calls_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waiter_calls_restaurant ON public.waiter_calls USING btree (restaurant_id);


--
-- Name: idx_waiter_calls_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waiter_calls_status ON public.waiter_calls USING btree (restaurant_id, status, created_at DESC);


--
-- Name: idx_whatsapp_logs_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_logs_restaurant ON public.whatsapp_logs USING btree (restaurant_id, sent_at DESC);


--
-- Name: idx_whatsapp_templates_restaurant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_templates_restaurant ON public.whatsapp_templates USING btree (restaurant_id, created_at DESC);


--
-- Name: push_subscriptions_restaurant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_restaurant_id_idx ON public.push_subscriptions USING btree (restaurant_id);


--
-- Name: uniq_active_order_per_table; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_active_order_per_table ON public.orders USING btree (restaurant_id, table_number) WHERE ((status = 'active'::text) AND (table_number <> 0));


--
-- Name: whatsapp_templates_restaurant_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_restaurant_id_created_at_idx ON public.whatsapp_templates USING btree (restaurant_id, created_at DESC);


--
-- Name: inventory_categories inventory_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_categories_updated_at BEFORE UPDATE ON public.inventory_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_items inventory_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: inventory_units inventory_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_units_updated_at BEFORE UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: restaurants strip_settings_secrets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER strip_settings_secrets BEFORE INSERT OR UPDATE OF settings ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.strip_restaurant_settings_secrets();


--
-- Name: delivery_orders trg_delivery_order_placed_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_delivery_order_placed_notify AFTER INSERT ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.fn_delivery_order_placed_notify();


--
-- Name: delivery_orders trg_delivery_status_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_delivery_status_notify AFTER UPDATE OF status ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.fn_delivery_status_notify();


--
-- Name: inventory_items trg_inventory_stock_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_inventory_stock_notify AFTER UPDATE OF current_stock ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.fn_inventory_stock_notify();


--
-- Name: order_items trg_order_items_restaurant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_items_restaurant BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_set_restaurant();


--
-- Name: audit_logs trg_purge_old_audit_logs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_purge_old_audit_logs AFTER INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.purge_old_audit_logs();


--
-- Name: order_items trg_recalc_order_total; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalc_order_total AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.recalc_order_total();


--
-- Name: staff trg_staff_hash_pin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_hash_pin BEFORE INSERT OR UPDATE OF pin ON public.staff FOR EACH ROW EXECUTE FUNCTION public.fn_staff_hash_pin();


--
-- Name: waiter_calls trg_waiter_call_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_waiter_call_audit AFTER INSERT ON public.waiter_calls FOR EACH ROW EXECUTE FUNCTION public.fn_waiter_call_audit();


--
-- Name: audit_logs audit_logs_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: combo_discounts combo_discounts_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combo_discounts
    ADD CONSTRAINT combo_discounts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: currencies currencies_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: customer_feedback customer_feedback_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_feedback
    ADD CONSTRAINT customer_feedback_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: customer_feedback customer_feedback_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_feedback
    ADD CONSTRAINT customer_feedback_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: customers customers_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: delivery_notifications delivery_notifications_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notifications
    ADD CONSTRAINT delivery_notifications_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.delivery_orders(id) ON DELETE CASCADE;


--
-- Name: delivery_notifications delivery_notifications_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_notifications
    ADD CONSTRAINT delivery_notifications_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: delivery_orders delivery_orders_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: delivery_orders delivery_orders_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: delivery_orders delivery_orders_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: delivery_zones delivery_zones_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_zones
    ADD CONSTRAINT delivery_zones_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: discount_codes discount_codes_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_codes
    ADD CONSTRAINT discount_codes_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: discounts discounts_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: events_offers events_offers_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events_offers
    ADD CONSTRAINT events_offers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: expenses expenses_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: floor_elements floor_elements_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floor_elements
    ADD CONSTRAINT floor_elements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.table_groups(id) ON DELETE CASCADE;


--
-- Name: floor_elements floor_elements_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.floor_elements
    ADD CONSTRAINT floor_elements_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: inventory_categories inventory_categories_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_categories
    ADD CONSTRAINT inventory_categories_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id) ON DELETE SET NULL;


--
-- Name: inventory_items inventory_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.inventory_units(id) ON DELETE SET NULL;


--
-- Name: inventory_notifications inventory_notifications_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_notifications
    ADD CONSTRAINT inventory_notifications_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: inventory_notifications inventory_notifications_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_notifications
    ADD CONSTRAINT inventory_notifications_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: inventory_units inventory_units_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_units
    ADD CONSTRAINT inventory_units_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: invoice_number_settings invoice_number_settings_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_number_settings
    ADD CONSTRAINT invoice_number_settings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: kds_station_categories kds_station_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: kds_station_categories kds_station_categories_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_station_categories
    ADD CONSTRAINT kds_station_categories_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kds_stations(id) ON DELETE CASCADE;


--
-- Name: kds_stations kds_stations_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_stations
    ADD CONSTRAINT kds_stations_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: kitchen_notes kitchen_notes_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kitchen_notes
    ADD CONSTRAINT kitchen_notes_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: members members_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: menu_categories menu_categories_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_ingredients menu_item_ingredients_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_ingredients
    ADD CONSTRAINT menu_item_ingredients_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: menu_item_modifiers menu_item_modifiers_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;


--
-- Name: menu_item_modifiers menu_item_modifiers_modifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_item_modifiers
    ADD CONSTRAINT menu_item_modifiers_modifier_id_fkey FOREIGN KEY (modifier_id) REFERENCES public.menu_modifiers(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE SET NULL;


--
-- Name: menu_items menu_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: menu_modifiers menu_modifiers_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_modifiers
    ADD CONSTRAINT menu_modifiers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: menu_template_settings menu_template_settings_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_template_settings
    ADD CONSTRAINT menu_template_settings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: modifier_options modifier_options_modifier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modifier_options
    ADD CONSTRAINT modifier_options_modifier_id_fkey FOREIGN KEY (modifier_id) REFERENCES public.menu_modifiers(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.kds_stations(id) ON DELETE SET NULL;


--
-- Name: order_number_settings order_number_settings_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_number_settings
    ADD CONSTRAINT order_number_settings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: orders orders_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: pay_later_payments pay_later_payments_pay_later_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_later_payments
    ADD CONSTRAINT pay_later_payments_pay_later_id_fkey FOREIGN KEY (pay_later_id) REFERENCES public.pay_later(id) ON DELETE CASCADE;


--
-- Name: pay_later pay_later_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_later
    ADD CONSTRAINT pay_later_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: payment_methods payment_methods_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: printer_categories printer_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printer_categories
    ADD CONSTRAINT printer_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;


--
-- Name: printer_categories printer_categories_printer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printer_categories
    ADD CONSTRAINT printer_categories_printer_id_fkey FOREIGN KEY (printer_id) REFERENCES public.printers(id) ON DELETE CASCADE;


--
-- Name: printers printers_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;


--
-- Name: receipt_settings receipt_settings_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_settings
    ADD CONSTRAINT receipt_settings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: reservations reservations_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;


--
-- Name: restaurant_roles restaurant_roles_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_roles
    ADD CONSTRAINT restaurant_roles_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: restaurant_secrets restaurant_secrets_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_secrets
    ADD CONSTRAINT restaurant_secrets_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: restaurant_users restaurant_users_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_users
    ADD CONSTRAINT restaurant_users_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: restaurant_users restaurant_users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_users
    ADD CONSTRAINT restaurant_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.restaurant_roles(id) ON DELETE SET NULL;


--
-- Name: restaurant_users restaurant_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_users
    ADD CONSTRAINT restaurant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: restaurants restaurants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurants
    ADD CONSTRAINT restaurants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: role_messages role_messages_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_messages
    ADD CONSTRAINT role_messages_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: staff staff_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: staff staff_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.restaurant_roles(id) ON DELETE SET NULL;


--
-- Name: staff_secrets staff_secrets_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_secrets
    ADD CONSTRAINT staff_secrets_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: staff_secrets staff_secrets_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_secrets
    ADD CONSTRAINT staff_secrets_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: surcharges surcharges_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surcharges
    ADD CONSTRAINT surcharges_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: table_groups table_groups_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_groups
    ADD CONSTRAINT table_groups_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: table_recoveries table_recoveries_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_recoveries
    ADD CONSTRAINT table_recoveries_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: tables tables_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.table_groups(id) ON DELETE SET NULL;


--
-- Name: tables tables_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: void_reasons void_reasons_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.void_reasons
    ADD CONSTRAINT void_reasons_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: waiter_calls waiter_calls_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: waiter_calls waiter_calls_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;


--
-- Name: whatsapp_logs whatsapp_logs_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_logs
    ADD CONSTRAINT whatsapp_logs_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_restaurant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: combo_discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.combo_discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: discount_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: events_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: floor_elements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.floor_elements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_number_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_number_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: kds_station_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kds_station_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: kds_stations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;

--
-- Name: kitchen_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kitchen_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_item_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_item_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_template_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_template_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: modifier_options; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_number_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_number_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles own_profile_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_profile_select ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: restaurants own_restaurant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY own_restaurant ON public.restaurants TO authenticated USING ((id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: pay_later; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pay_later ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_later_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pay_later_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: printer_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.printer_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: printers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_feedback public_insert_customer_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_insert_customer_feedback ON public.customer_feedback FOR INSERT TO anon WITH CHECK (true);


--
-- Name: waiter_calls public_insert_waiter_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_insert_waiter_calls ON public.waiter_calls FOR INSERT TO anon WITH CHECK (((status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = waiter_calls.table_id) AND (t.restaurant_id = waiter_calls.restaurant_id))))));


--
-- Name: combo_discounts public_read_combo_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_combo_discounts ON public.combo_discounts FOR SELECT TO anon USING (true);


--
-- Name: currencies public_read_currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_currencies ON public.currencies FOR SELECT TO anon USING (true);


--
-- Name: events_offers public_read_events_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_events_offers ON public.events_offers FOR SELECT TO anon USING (true);


--
-- Name: kds_station_categories public_read_kds_station_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_kds_station_categories ON public.kds_station_categories FOR SELECT TO anon USING (true);


--
-- Name: kds_stations public_read_kds_stations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_kds_stations ON public.kds_stations FOR SELECT TO anon USING (true);


--
-- Name: kitchen_notes public_read_kitchen_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_kitchen_notes ON public.kitchen_notes FOR SELECT TO anon USING (true);


--
-- Name: menu_categories public_read_menu_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_menu_categories ON public.menu_categories FOR SELECT TO anon USING (true);


--
-- Name: menu_item_modifiers public_read_menu_item_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_menu_item_modifiers ON public.menu_item_modifiers FOR SELECT TO anon USING (true);


--
-- Name: menu_items public_read_menu_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_menu_items ON public.menu_items FOR SELECT TO anon USING (true);


--
-- Name: menu_modifiers public_read_menu_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_menu_modifiers ON public.menu_modifiers FOR SELECT TO anon USING (true);


--
-- Name: menu_template_settings public_read_menu_template_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_menu_template_settings ON public.menu_template_settings FOR SELECT TO anon USING (true);


--
-- Name: modifier_options public_read_modifier_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_modifier_options ON public.modifier_options FOR SELECT TO anon USING (true);


--
-- Name: plans public_read_plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_plans ON public.plans FOR SELECT TO authenticated, anon USING (true);


--
-- Name: table_groups public_read_table_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_table_groups ON public.table_groups FOR SELECT TO anon USING (true);


--
-- Name: tables public_read_tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_tables ON public.tables FOR SELECT TO anon USING (true);


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: receipt_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery_zones restaurant staff can manage delivery zones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "restaurant staff can manage delivery zones" ON public.delivery_zones USING ((restaurant_id IN ( SELECT restaurant_users.restaurant_id
   FROM public.restaurant_users
  WHERE (restaurant_users.user_id = auth.uid()))));


--
-- Name: restaurant_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurant_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurant_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurant_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;

--
-- Name: restaurants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

--
-- Name: role_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: surcharges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.surcharges ENABLE ROW LEVEL SECURITY;

--
-- Name: table_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.table_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: table_recoveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.table_recoveries ENABLE ROW LEVEL SECURITY;

--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs tenant_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_audit_logs ON public.audit_logs TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: combo_discounts tenant_combo_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_combo_discounts ON public.combo_discounts TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: currencies tenant_currencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_currencies ON public.currencies TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: customer_feedback tenant_customer_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_customer_feedback ON public.customer_feedback TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: customers tenant_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_customers ON public.customers TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: delivery_notifications tenant_delivery_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delivery_notifications ON public.delivery_notifications TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: delivery_orders tenant_delivery_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delivery_orders ON public.delivery_orders TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: delivery_zones tenant_delivery_zones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delivery_zones ON public.delivery_zones TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: discount_codes tenant_discount_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_discount_codes ON public.discount_codes TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: discounts tenant_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_discounts ON public.discounts TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: events_offers tenant_events_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_events_offers ON public.events_offers TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: expenses tenant_expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_expenses ON public.expenses TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: floor_elements tenant_floor_elements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_floor_elements ON public.floor_elements TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: inventory_categories tenant_inventory_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_inventory_categories ON public.inventory_categories TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: inventory_items tenant_inventory_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_inventory_items ON public.inventory_items TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: inventory_notifications tenant_inventory_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_inventory_notifications ON public.inventory_notifications TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: inventory_units tenant_inventory_units; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_inventory_units ON public.inventory_units TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: invoice_number_settings tenant_invoice_number_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_invoice_number_settings ON public.invoice_number_settings TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: invoices tenant_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_invoices ON public.invoices TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: kds_station_categories tenant_kds_station_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_kds_station_categories ON public.kds_station_categories TO authenticated USING ((station_id IN ( SELECT kds_stations.id
   FROM public.kds_stations
  WHERE (kds_stations.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))))) WITH CHECK ((station_id IN ( SELECT kds_stations.id
   FROM public.kds_stations
  WHERE (kds_stations.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)))));


--
-- Name: kds_stations tenant_kds_stations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_kds_stations ON public.kds_stations TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: kitchen_notes tenant_kitchen_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_kitchen_notes ON public.kitchen_notes TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: members tenant_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_members ON public.members TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: menu_categories tenant_menu_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_categories ON public.menu_categories TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: menu_item_ingredients tenant_menu_item_ingredients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_item_ingredients ON public.menu_item_ingredients TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: menu_item_modifiers tenant_menu_item_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_item_modifiers ON public.menu_item_modifiers TO authenticated USING ((modifier_id IN ( SELECT menu_modifiers.id
   FROM public.menu_modifiers
  WHERE (menu_modifiers.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))))) WITH CHECK ((modifier_id IN ( SELECT menu_modifiers.id
   FROM public.menu_modifiers
  WHERE (menu_modifiers.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)))));


--
-- Name: menu_items tenant_menu_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_items ON public.menu_items TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: menu_modifiers tenant_menu_modifiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_modifiers ON public.menu_modifiers TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: menu_template_settings tenant_menu_template_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_template_settings ON public.menu_template_settings TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: modifier_options tenant_modifier_options; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_modifier_options ON public.modifier_options TO authenticated USING ((modifier_id IN ( SELECT menu_modifiers.id
   FROM public.menu_modifiers
  WHERE (menu_modifiers.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))))) WITH CHECK ((modifier_id IN ( SELECT menu_modifiers.id
   FROM public.menu_modifiers
  WHERE (menu_modifiers.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)))));


--
-- Name: order_items tenant_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_order_items ON public.order_items TO authenticated USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))))) WITH CHECK ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE (orders.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)))));


--
-- Name: order_number_settings tenant_order_number_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_order_number_settings ON public.order_number_settings TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: orders tenant_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_orders ON public.orders TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: pay_later tenant_pay_later; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_pay_later ON public.pay_later TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: pay_later_payments tenant_pay_later_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_pay_later_payments ON public.pay_later_payments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pay_later pl
  WHERE ((pl.id = pay_later_payments.pay_later_id) AND (pl.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pay_later pl
  WHERE ((pl.id = pay_later_payments.pay_later_id) AND (pl.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))))));


--
-- Name: payment_methods tenant_payment_methods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_payment_methods ON public.payment_methods TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: printer_categories tenant_printer_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_printer_categories ON public.printer_categories TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.printers p
  WHERE ((p.id = printer_categories.printer_id) AND (p.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.printers p
  WHERE ((p.id = printer_categories.printer_id) AND (p.restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))))));


--
-- Name: printers tenant_printers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_printers ON public.printers TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: push_subscriptions tenant_push_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_push_subscriptions ON public.push_subscriptions TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: receipt_settings tenant_receipt_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_receipt_settings ON public.receipt_settings TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: reservations tenant_reservations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_reservations ON public.reservations TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: restaurant_roles tenant_restaurant_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_restaurant_roles ON public.restaurant_roles TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: restaurant_users tenant_restaurant_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_restaurant_users ON public.restaurant_users TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: role_messages tenant_role_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_role_messages ON public.role_messages TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: staff tenant_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_staff ON public.staff TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: surcharges tenant_surcharges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_surcharges ON public.surcharges TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: table_groups tenant_table_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_table_groups ON public.table_groups TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: table_recoveries tenant_table_recoveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_table_recoveries ON public.table_recoveries TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: tables tenant_tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_tables ON public.tables TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: void_reasons tenant_void_reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_void_reasons ON public.void_reasons TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: waiter_calls tenant_waiter_calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_waiter_calls ON public.waiter_calls TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: whatsapp_templates tenant_whatsapp_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_whatsapp_templates ON public.whatsapp_templates TO authenticated USING ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids))) WITH CHECK ((restaurant_id IN ( SELECT public.user_restaurant_ids() AS user_restaurant_ids)));


--
-- Name: void_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.void_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: waiter_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_logs whatsapp_logs_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY whatsapp_logs_policy ON public.whatsapp_logs USING ((restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.owner_id = auth.uid())
UNION
 SELECT restaurant_users.restaurant_id
   FROM public.restaurant_users
  WHERE (restaurant_users.user_id = auth.uid())))) WITH CHECK ((restaurant_id IN ( SELECT restaurants.id
   FROM public.restaurants
  WHERE (restaurants.owner_id = auth.uid())
UNION
 SELECT restaurant_users.restaurant_id
   FROM public.restaurant_users
  WHERE (restaurant_users.user_id = auth.uid()))));


--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION check_inventory_expiry(p_warn_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_inventory_expiry(p_warn_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_inventory_expiry(p_warn_days integer) TO service_role;


--
-- Name: FUNCTION fn_deduct_inventory_for_order(p_order_id uuid, p_restaurant_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_deduct_inventory_for_order(p_order_id uuid, p_restaurant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_deduct_inventory_for_order(p_order_id uuid, p_restaurant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_deduct_inventory_for_order(p_order_id uuid, p_restaurant_id uuid) TO service_role;


--
-- Name: FUNCTION fn_delivery_order_placed_notify(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_delivery_order_placed_notify() TO anon;
GRANT ALL ON FUNCTION public.fn_delivery_order_placed_notify() TO authenticated;
GRANT ALL ON FUNCTION public.fn_delivery_order_placed_notify() TO service_role;


--
-- Name: FUNCTION fn_delivery_status_notify(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_delivery_status_notify() TO anon;
GRANT ALL ON FUNCTION public.fn_delivery_status_notify() TO authenticated;
GRANT ALL ON FUNCTION public.fn_delivery_status_notify() TO service_role;


--
-- Name: FUNCTION fn_haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) TO anon;
GRANT ALL ON FUNCTION public.fn_haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) TO authenticated;
GRANT ALL ON FUNCTION public.fn_haversine_meters(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) TO service_role;


--
-- Name: FUNCTION fn_inventory_stock_notify(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_inventory_stock_notify() TO anon;
GRANT ALL ON FUNCTION public.fn_inventory_stock_notify() TO authenticated;
GRANT ALL ON FUNCTION public.fn_inventory_stock_notify() TO service_role;


--
-- Name: TABLE delivery_zones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery_zones TO anon;
GRANT ALL ON TABLE public.delivery_zones TO authenticated;
GRANT ALL ON TABLE public.delivery_zones TO service_role;


--
-- Name: FUNCTION fn_match_delivery_zone(p_restaurant_id uuid, p_lat double precision, p_lng double precision); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_match_delivery_zone(p_restaurant_id uuid, p_lat double precision, p_lng double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_match_delivery_zone(p_restaurant_id uuid, p_lat double precision, p_lng double precision) TO service_role;


--
-- Name: FUNCTION fn_order_items_set_restaurant(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_order_items_set_restaurant() TO anon;
GRANT ALL ON FUNCTION public.fn_order_items_set_restaurant() TO authenticated;
GRANT ALL ON FUNCTION public.fn_order_items_set_restaurant() TO service_role;


--
-- Name: FUNCTION fn_point_in_polygon(p_lat double precision, p_lng double precision, p_polygon jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_point_in_polygon(p_lat double precision, p_lng double precision, p_polygon jsonb) TO anon;
GRANT ALL ON FUNCTION public.fn_point_in_polygon(p_lat double precision, p_lng double precision, p_polygon jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fn_point_in_polygon(p_lat double precision, p_lng double precision, p_polygon jsonb) TO service_role;


--
-- Name: FUNCTION fn_restock_inventory_item(p_item_id uuid, p_new_stock numeric, p_batch_number text, p_expiry_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_restock_inventory_item(p_item_id uuid, p_new_stock numeric, p_batch_number text, p_expiry_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_restock_inventory_item(p_item_id uuid, p_new_stock numeric, p_batch_number text, p_expiry_date date) TO authenticated;
GRANT ALL ON FUNCTION public.fn_restock_inventory_item(p_item_id uuid, p_new_stock numeric, p_batch_number text, p_expiry_date date) TO service_role;


--
-- Name: FUNCTION fn_staff_hash_pin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_staff_hash_pin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_staff_hash_pin() TO service_role;


--
-- Name: FUNCTION fn_waiter_call_audit(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fn_waiter_call_audit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fn_waiter_call_audit() TO service_role;


--
-- Name: FUNCTION guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid) TO service_role;


--
-- Name: FUNCTION guest_num(p jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_num(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_num(p jsonb) TO service_role;


--
-- Name: FUNCTION guest_order_items(p_order_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_order_items(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_order_items(p_order_id uuid) TO anon;
GRANT ALL ON FUNCTION public.guest_order_items(p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.guest_order_items(p_order_id uuid) TO service_role;


--
-- Name: FUNCTION guest_place_delivery_order(p_restaurant_id uuid, p_items jsonb, p_customer jsonb, p_coupon_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_place_delivery_order(p_restaurant_id uuid, p_items jsonb, p_customer jsonb, p_coupon_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_place_delivery_order(p_restaurant_id uuid, p_items jsonb, p_customer jsonb, p_coupon_code text) TO anon;
GRANT ALL ON FUNCTION public.guest_place_delivery_order(p_restaurant_id uuid, p_items jsonb, p_customer jsonb, p_coupon_code text) TO authenticated;
GRANT ALL ON FUNCTION public.guest_place_delivery_order(p_restaurant_id uuid, p_items jsonb, p_customer jsonb, p_coupon_code text) TO service_role;


--
-- Name: FUNCTION guest_price_items(p_restaurant_id uuid, p_items jsonb, p_channel text, p_note_sep text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_price_items(p_restaurant_id uuid, p_items jsonb, p_channel text, p_note_sep text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_price_items(p_restaurant_id uuid, p_items jsonb, p_channel text, p_note_sep text) TO service_role;


--
-- Name: FUNCTION guest_track_delivery_orders(p_restaurant_id uuid, p_phone text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_track_delivery_orders(p_restaurant_id uuid, p_phone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_track_delivery_orders(p_restaurant_id uuid, p_phone text) TO anon;
GRANT ALL ON FUNCTION public.guest_track_delivery_orders(p_restaurant_id uuid, p_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.guest_track_delivery_orders(p_restaurant_id uuid, p_phone text) TO service_role;


--
-- Name: FUNCTION guest_validate_discount_code(p_restaurant_id uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guest_validate_discount_code(p_restaurant_id uuid, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guest_validate_discount_code(p_restaurant_id uuid, p_code text) TO anon;
GRANT ALL ON FUNCTION public.guest_validate_discount_code(p_restaurant_id uuid, p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.guest_validate_discount_code(p_restaurant_id uuid, p_code text) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION pos_send_to_kitchen(p_restaurant_id uuid, p_table_number integer, p_guests integer, p_items jsonb, p_source text, p_item_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pos_send_to_kitchen(p_restaurant_id uuid, p_table_number integer, p_guests integer, p_items jsonb, p_source text, p_item_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pos_send_to_kitchen(p_restaurant_id uuid, p_table_number integer, p_guests integer, p_items jsonb, p_source text, p_item_status text) TO anon;
GRANT ALL ON FUNCTION public.pos_send_to_kitchen(p_restaurant_id uuid, p_table_number integer, p_guests integer, p_items jsonb, p_source text, p_item_status text) TO authenticated;
GRANT ALL ON FUNCTION public.pos_send_to_kitchen(p_restaurant_id uuid, p_table_number integer, p_guests integer, p_items jsonb, p_source text, p_item_status text) TO service_role;


--
-- Name: FUNCTION purge_old_audit_logs(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.purge_old_audit_logs() TO anon;
GRANT ALL ON FUNCTION public.purge_old_audit_logs() TO authenticated;
GRANT ALL ON FUNCTION public.purge_old_audit_logs() TO service_role;


--
-- Name: FUNCTION recalc_order_total(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recalc_order_total() TO anon;
GRANT ALL ON FUNCTION public.recalc_order_total() TO authenticated;
GRANT ALL ON FUNCTION public.recalc_order_total() TO service_role;


--
-- Name: FUNCTION security_policy_report(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.security_policy_report() FROM PUBLIC;
GRANT ALL ON FUNCTION public.security_policy_report() TO service_role;


--
-- Name: FUNCTION security_trigger_report(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.security_trigger_report() FROM PUBLIC;
GRANT ALL ON FUNCTION public.security_trigger_report() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION staff_pin_match(p_restaurant_id uuid, p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_pin_match(p_restaurant_id uuid, p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_pin_match(p_restaurant_id uuid, p_pin text) TO service_role;


--
-- Name: FUNCTION storage_path_restaurant(p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.storage_path_restaurant(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.storage_path_restaurant(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.storage_path_restaurant(p_name text) TO service_role;


--
-- Name: FUNCTION strip_restaurant_settings_secrets(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.strip_restaurant_settings_secrets() TO anon;
GRANT ALL ON FUNCTION public.strip_restaurant_settings_secrets() TO authenticated;
GRANT ALL ON FUNCTION public.strip_restaurant_settings_secrets() TO service_role;


--
-- Name: FUNCTION user_restaurant_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_restaurant_ids() TO anon;
GRANT ALL ON FUNCTION public.user_restaurant_ids() TO authenticated;
GRANT ALL ON FUNCTION public.user_restaurant_ids() TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE combo_discounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.combo_discounts TO anon;
GRANT ALL ON TABLE public.combo_discounts TO authenticated;
GRANT ALL ON TABLE public.combo_discounts TO service_role;


--
-- Name: TABLE currencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.currencies TO anon;
GRANT ALL ON TABLE public.currencies TO authenticated;
GRANT ALL ON TABLE public.currencies TO service_role;


--
-- Name: TABLE customer_feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_feedback TO anon;
GRANT ALL ON TABLE public.customer_feedback TO authenticated;
GRANT ALL ON TABLE public.customer_feedback TO service_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- Name: TABLE delivery_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery_notifications TO anon;
GRANT ALL ON TABLE public.delivery_notifications TO authenticated;
GRANT ALL ON TABLE public.delivery_notifications TO service_role;


--
-- Name: TABLE delivery_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delivery_orders TO anon;
GRANT ALL ON TABLE public.delivery_orders TO authenticated;
GRANT ALL ON TABLE public.delivery_orders TO service_role;


--
-- Name: TABLE discount_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.discount_codes TO anon;
GRANT ALL ON TABLE public.discount_codes TO authenticated;
GRANT ALL ON TABLE public.discount_codes TO service_role;


--
-- Name: TABLE discounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.discounts TO anon;
GRANT ALL ON TABLE public.discounts TO authenticated;
GRANT ALL ON TABLE public.discounts TO service_role;


--
-- Name: TABLE events_offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events_offers TO anon;
GRANT ALL ON TABLE public.events_offers TO authenticated;
GRANT ALL ON TABLE public.events_offers TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expenses TO anon;
GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE floor_elements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.floor_elements TO anon;
GRANT ALL ON TABLE public.floor_elements TO authenticated;
GRANT ALL ON TABLE public.floor_elements TO service_role;


--
-- Name: TABLE inventory_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_categories TO anon;
GRANT ALL ON TABLE public.inventory_categories TO authenticated;
GRANT ALL ON TABLE public.inventory_categories TO service_role;


--
-- Name: TABLE inventory_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_items TO anon;
GRANT ALL ON TABLE public.inventory_items TO authenticated;
GRANT ALL ON TABLE public.inventory_items TO service_role;


--
-- Name: TABLE inventory_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_notifications TO anon;
GRANT ALL ON TABLE public.inventory_notifications TO authenticated;
GRANT ALL ON TABLE public.inventory_notifications TO service_role;


--
-- Name: TABLE inventory_units; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_units TO anon;
GRANT ALL ON TABLE public.inventory_units TO authenticated;
GRANT ALL ON TABLE public.inventory_units TO service_role;


--
-- Name: TABLE invoice_number_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoice_number_settings TO anon;
GRANT ALL ON TABLE public.invoice_number_settings TO authenticated;
GRANT ALL ON TABLE public.invoice_number_settings TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE kds_station_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kds_station_categories TO anon;
GRANT ALL ON TABLE public.kds_station_categories TO authenticated;
GRANT ALL ON TABLE public.kds_station_categories TO service_role;


--
-- Name: TABLE kds_stations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kds_stations TO anon;
GRANT ALL ON TABLE public.kds_stations TO authenticated;
GRANT ALL ON TABLE public.kds_stations TO service_role;


--
-- Name: TABLE kitchen_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kitchen_notes TO anon;
GRANT ALL ON TABLE public.kitchen_notes TO authenticated;
GRANT ALL ON TABLE public.kitchen_notes TO service_role;


--
-- Name: TABLE members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.members TO anon;
GRANT ALL ON TABLE public.members TO authenticated;
GRANT ALL ON TABLE public.members TO service_role;


--
-- Name: TABLE menu_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_categories TO anon;
GRANT ALL ON TABLE public.menu_categories TO authenticated;
GRANT ALL ON TABLE public.menu_categories TO service_role;


--
-- Name: TABLE menu_item_ingredients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_item_ingredients TO anon;
GRANT ALL ON TABLE public.menu_item_ingredients TO authenticated;
GRANT ALL ON TABLE public.menu_item_ingredients TO service_role;


--
-- Name: TABLE menu_item_modifiers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_item_modifiers TO anon;
GRANT ALL ON TABLE public.menu_item_modifiers TO authenticated;
GRANT ALL ON TABLE public.menu_item_modifiers TO service_role;


--
-- Name: TABLE menu_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_items TO anon;
GRANT ALL ON TABLE public.menu_items TO authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;


--
-- Name: TABLE menu_modifiers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_modifiers TO anon;
GRANT ALL ON TABLE public.menu_modifiers TO authenticated;
GRANT ALL ON TABLE public.menu_modifiers TO service_role;


--
-- Name: TABLE menu_template_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_template_settings TO anon;
GRANT ALL ON TABLE public.menu_template_settings TO authenticated;
GRANT ALL ON TABLE public.menu_template_settings TO service_role;


--
-- Name: TABLE modifier_options; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.modifier_options TO anon;
GRANT ALL ON TABLE public.modifier_options TO authenticated;
GRANT ALL ON TABLE public.modifier_options TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: TABLE order_number_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_number_settings TO anon;
GRANT ALL ON TABLE public.order_number_settings TO authenticated;
GRANT ALL ON TABLE public.order_number_settings TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE pay_later; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pay_later TO anon;
GRANT ALL ON TABLE public.pay_later TO authenticated;
GRANT ALL ON TABLE public.pay_later TO service_role;


--
-- Name: TABLE pay_later_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pay_later_payments TO anon;
GRANT ALL ON TABLE public.pay_later_payments TO authenticated;
GRANT ALL ON TABLE public.pay_later_payments TO service_role;


--
-- Name: TABLE payment_methods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_methods TO anon;
GRANT ALL ON TABLE public.payment_methods TO authenticated;
GRANT ALL ON TABLE public.payment_methods TO service_role;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.plans TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;


--
-- Name: TABLE printer_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.printer_categories TO anon;
GRANT ALL ON TABLE public.printer_categories TO authenticated;
GRANT ALL ON TABLE public.printer_categories TO service_role;


--
-- Name: TABLE printers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.printers TO anon;
GRANT ALL ON TABLE public.printers TO authenticated;
GRANT ALL ON TABLE public.printers TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE receipt_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.receipt_settings TO anon;
GRANT ALL ON TABLE public.receipt_settings TO authenticated;
GRANT ALL ON TABLE public.receipt_settings TO service_role;


--
-- Name: TABLE reservations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reservations TO anon;
GRANT ALL ON TABLE public.reservations TO authenticated;
GRANT ALL ON TABLE public.reservations TO service_role;


--
-- Name: TABLE restaurants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.restaurants TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.restaurants TO authenticated;
GRANT ALL ON TABLE public.restaurants TO service_role;


--
-- Name: COLUMN restaurants.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.restaurants TO authenticated;


--
-- Name: COLUMN restaurants.address; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(address) ON TABLE public.restaurants TO authenticated;


--
-- Name: COLUMN restaurants.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.restaurants TO authenticated;


--
-- Name: COLUMN restaurants.email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(email) ON TABLE public.restaurants TO authenticated;


--
-- Name: COLUMN restaurants.logo_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(logo_url) ON TABLE public.restaurants TO authenticated;


--
-- Name: COLUMN restaurants.settings; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(settings) ON TABLE public.restaurants TO authenticated;


--
-- Name: COLUMN restaurants.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.restaurants TO authenticated;


--
-- Name: TABLE restaurant_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.restaurant_public TO anon;
GRANT ALL ON TABLE public.restaurant_public TO authenticated;
GRANT ALL ON TABLE public.restaurant_public TO service_role;


--
-- Name: TABLE restaurant_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.restaurant_roles TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.restaurant_roles TO authenticated;
GRANT ALL ON TABLE public.restaurant_roles TO service_role;


--
-- Name: TABLE restaurant_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.restaurant_secrets TO anon;
GRANT ALL ON TABLE public.restaurant_secrets TO authenticated;
GRANT ALL ON TABLE public.restaurant_secrets TO service_role;


--
-- Name: TABLE restaurant_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.restaurant_users TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.restaurant_users TO authenticated;
GRANT ALL ON TABLE public.restaurant_users TO service_role;


--
-- Name: TABLE role_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_messages TO anon;
GRANT ALL ON TABLE public.role_messages TO authenticated;
GRANT ALL ON TABLE public.role_messages TO service_role;


--
-- Name: TABLE staff; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.staff TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.staff TO authenticated;
GRANT ALL ON TABLE public.staff TO service_role;


--
-- Name: TABLE staff_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_secrets TO service_role;


--
-- Name: TABLE surcharges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.surcharges TO anon;
GRANT ALL ON TABLE public.surcharges TO authenticated;
GRANT ALL ON TABLE public.surcharges TO service_role;


--
-- Name: TABLE table_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.table_groups TO anon;
GRANT ALL ON TABLE public.table_groups TO authenticated;
GRANT ALL ON TABLE public.table_groups TO service_role;


--
-- Name: TABLE table_recoveries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.table_recoveries TO anon;
GRANT ALL ON TABLE public.table_recoveries TO authenticated;
GRANT ALL ON TABLE public.table_recoveries TO service_role;


--
-- Name: TABLE tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tables TO anon;
GRANT ALL ON TABLE public.tables TO authenticated;
GRANT ALL ON TABLE public.tables TO service_role;


--
-- Name: TABLE void_reasons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.void_reasons TO anon;
GRANT ALL ON TABLE public.void_reasons TO authenticated;
GRANT ALL ON TABLE public.void_reasons TO service_role;


--
-- Name: TABLE waiter_calls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waiter_calls TO anon;
GRANT ALL ON TABLE public.waiter_calls TO authenticated;
GRANT ALL ON TABLE public.waiter_calls TO service_role;


--
-- Name: TABLE whatsapp_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_logs TO anon;
GRANT ALL ON TABLE public.whatsapp_logs TO authenticated;
GRANT ALL ON TABLE public.whatsapp_logs TO service_role;


--
-- Name: TABLE whatsapp_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.whatsapp_templates TO anon;
GRANT ALL ON TABLE public.whatsapp_templates TO authenticated;
GRANT ALL ON TABLE public.whatsapp_templates TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict 3JPeNiLYbEwy9Jq1bMyq9gNCuaBln8vzndPAnfxt4LYn7gVVE1oGq4frPCiUycG

