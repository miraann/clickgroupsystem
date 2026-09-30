-- ============================================================
-- 20260930_01 — Server-side pricing for guest orders
-- ------------------------------------------------------------
-- Run AFTER 20260928_03. Additive and compatible with the build that is live
-- before it: the QR guest page already calls pos_send_to_kitchen with
-- source 'guest' / status 'pending', and the delivery page only switches to
-- guest_place_delivery_order in the build that ships with this file.
--
-- Problem: both public ordering surfaces sent their own prices.
--   · /guest/[tableId] → pos_send_to_kitchen (anon, SECURITY DEFINER) took
--     item_name / item_price / p_source / p_item_status from the caller, so
--     anyone could put a 0 or negative-priced order on any restaurant's table,
--     or send it straight to the kitchen as 'staff'.
--   · /order/[slug] inserted orders.total, order_items.item_price and
--     delivery_orders.delivery_fee directly, and the coupon discount was
--     computed in the browser.
--
--   1. guest_num / guest_price_items — internal helpers. A guest item is
--      priced from menu_items (+ delivery_price on the delivery channel) and
--      the modifier_options it names by id; each option must belong to a
--      modifier linked to that item. Modifier names are written into the
--      note server-side, so the kitchen sees what was paid for.
--   2. pos_send_to_kitchen — an anon caller must be a guest ('guest' /
--      'pending') on a real table; its items are re-priced. A signed-in
--      caller must belong to the restaurant (it was callable across tenants).
--      The 'guest_order' audit entry is written here, not by the browser.
--   3. guest_place_delivery_order — the whole delivery checkout in one call:
--      prices, fee (settings.default_delivery_fee / free_delivery_above),
--      minimum order, coupon (validated + counted under a row lock), order +
--      items + delivery row + audit entry.
--   4. waiter_calls — audit entry from a trigger; anon inserts must name a
--      table of that restaurant.
--
-- 20260930_02 then removes the direct anon INSERTs this replaces.
-- ============================================================

begin;

-- ── 1. Helpers (not callable through the API) ─────────────────────────────
-- Mirrors the browser's Number(): '' → 0, junk → null.
create or replace function public.guest_num(p jsonb)
returns numeric
language sql immutable set search_path = public
as $$
  select case jsonb_typeof(p)
    when 'number' then (p #>> '{}')::numeric
    when 'string' then case
      when btrim(p #>> '{}') = '' then 0
      when btrim(p #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p #>> '{}')::numeric
    end
  end
$$;

-- p_items: jsonb array of { menu_item_id, qty, option_ids?: uuid[], note?, station_id? }
-- Returns the same array re-priced:
--   { menu_item_id, item_name, item_price, qty, note, station_id }
create or replace function public.guest_price_items(
  p_restaurant_id uuid, p_items jsonb, p_channel text, p_note_sep text
) returns jsonb
language plpgsql stable set search_path = public
as $$
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
end $$;

revoke all on function public.guest_num(jsonb) from public, anon, authenticated;
revoke all on function public.guest_price_items(uuid, jsonb, text, text) from public, anon, authenticated;

-- ── 2. pos_send_to_kitchen ────────────────────────────────────────────────
-- Same signature and return shape as 20260913_03; only the caller checks and
-- guest re-pricing are new.
create or replace function public.pos_send_to_kitchen(
  p_restaurant_id uuid,
  p_table_number  int,
  p_guests        int,
  p_items         jsonb,
  p_source        text default 'staff',
  p_item_status   text default 'sent'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all     on function public.pos_send_to_kitchen(uuid, int, int, jsonb, text, text) from public;
grant  execute on function public.pos_send_to_kitchen(uuid, int, int, jsonb, text, text) to anon, authenticated;

-- ── 3. guest_place_delivery_order ─────────────────────────────────────────
-- p_items:    as guest_price_items
-- p_customer: { name, phone, lat, lng, address?, selfie_url? }
create or replace function public.guest_place_delivery_order(
  p_restaurant_id uuid,
  p_items         jsonb,
  p_customer      jsonb,
  p_coupon_code   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all     on function public.guest_place_delivery_order(uuid, jsonb, jsonb, text) from public;
grant  execute on function public.guest_place_delivery_order(uuid, jsonb, jsonb, text) to anon, authenticated;

-- ── 4. Waiter calls ────────────────────────────────────────────────────────
create or replace function public.fn_waiter_call_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    insert into public.audit_logs (restaurant_id, staff_name, staff_role, action, entity_id, metadata)
    values (new.restaurant_id, 'Guest', 'guest', 'waiter_call', new.table_id::text,
            jsonb_build_object('table', new.table_number, 'table_name', new.table_name));
  end if;
  return null;
end $$;
revoke all on function public.fn_waiter_call_audit() from public, anon, authenticated;

drop trigger if exists trg_waiter_call_audit on public.waiter_calls;
create trigger trg_waiter_call_audit
  after insert on public.waiter_calls
  for each row execute function public.fn_waiter_call_audit();

-- Was `with check (true)`: a guest may only call a waiter to a real table of
-- the restaurant it names.
drop policy if exists public_insert_waiter_calls on public.waiter_calls;
create policy public_insert_waiter_calls on public.waiter_calls for insert to anon
  with check (
    status = 'pending'
    and exists (select 1 from public.tables t
                where t.id = waiter_calls.table_id and t.restaurant_id = waiter_calls.restaurant_id)
  );

notify pgrst, 'reload schema';

commit;
