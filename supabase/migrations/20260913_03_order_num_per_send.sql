-- ============================================================
-- 20260913_03 — A new order number on every send, not once per table
-- ------------------------------------------------------------
-- pos_send_to_kitchen() (20260909_01) only assigned order_num the first
-- time a table's tab was opened, and every later "Send" to that same
-- still-open tab reused it — so two separate kitchen tickets for the same
-- table (e.g. one item sent, then another sent a minute later) both printed
-- the same ORD-XXX. The restaurant wants every Send to mint its own number,
-- even mid-tab, so kitchen staff never see two different tickets carrying
-- the same order number.
--
-- FIX: drop the "only if null" guard — every call now reassigns
-- orders.order_num via the existing locked-counter helper
-- (guest_assign_order_number), so it always reflects the most recently
-- sent ticket for that table. Printed tickets already use the RPC's
-- returned order_num directly (src/lib/orderSend.ts), so this alone makes
-- every printed ticket carry a fresh number.
-- ============================================================

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

  -- Everyone hitting this table lines up here. Released at commit/rollback.
  -- Two ints: per-restaurant hash + the table number, so different tables
  -- (and different restaurants) never wait on each other.
  perform pg_advisory_xact_lock(hashtext(p_restaurant_id::text), p_table_number);

  select id into v_order_id
  from public.orders
  where restaurant_id = p_restaurant_id
    and table_number  = p_table_number
    and status        = 'active'
  order by created_at desc
  limit 1;

  if v_order_id is null then
    insert into public.orders (restaurant_id, table_number, guests, status, source, total)
    values (p_restaurant_id, p_table_number, coalesce(p_guests, 0),
            'active', coalesce(p_source, 'staff'), 0)
    returning id into v_order_id;
    v_is_new := true;
  end if;

  -- A fresh number on every send — one physical ticket, one number, even
  -- when it's another round sent to a table that's still open.
  v_order_num := public.guest_assign_order_number(p_restaurant_id, v_order_id);

  -- Insert every item in one shot; hand the written rows back to the client.
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
    from jsonb_array_elements(p_items) as e
    returning id, item_name, item_price, qty, status, note
  )
  select jsonb_agg(to_jsonb(ins)) into v_items from ins;

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
