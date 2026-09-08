-- ============================================================
-- 20260909_01 — Atomic "send to kitchen" + trigger-maintained order total
-- ------------------------------------------------------------
-- Closes two intra-restaurant races on the dine-in / guest order path.
--
--   RACE 1 — orders.total
--     Every send recomputed the total in JavaScript from a stale item
--     list and wrote it with last-write-wins. Two devices adding to the
--     same table at the same moment → one total silently clobbers the
--     other. The guest flow was worse: it wrote total = *just the guest's
--     items*, wiping whatever the waiter had already rung in.
--   FIX — a trigger on order_items keeps orders.total equal to the live
--     sum of its non-void items for every OPEN dine-in / guest order, and
--     takes a row lock on the parent order so concurrent item writes
--     serialise on the DB instead of racing in the client. Delivery
--     orders keep their client-set total (items + fee - discount, written
--     once at creation) and are left untouched.
--
--   RACE 2 — the 4-round-trip send
--     "Send to kitchen" was: find-or-INSERT the order → assign its number
--     (RPC) → INSERT the items → UPDATE the total. A failure between steps
--     left a numberless or item-less ghost order on the floor plan, and
--     two devices opening the same table together each passed the "no
--     active order" check and created TWO active orders for one table —
--     split items, two KDS cards, two order numbers, one gets paid.
--   FIX 2a — a partial unique index makes "two active orders for one
--     table" impossible at the DB level, no matter which code path runs.
--   FIX 2b — pos_send_to_kitchen() does find-or-create + number + item
--     insert in ONE transaction under a per-table advisory lock, and
--     returns the order id, number and inserted rows.
--
-- Additive and safe to run under load: the shipped app keeps its old
-- multi-step path and only uses the RPC once this migration is live
-- (src/lib/orderSend.ts probes for it, mirroring assignOrderNumber).
-- ============================================================

-- ── 0. De-dupe active orders the old race already created ─────────────────
--   Must happen before the unique index in step 2, or CREATE INDEX fails on
--   the existing duplicates. Keep the earliest active order per table, move
--   every item onto it, cancel the rest. No item is lost.
do $$
declare
  r record;
begin
  for r in
    select restaurant_id, table_number,
           (array_agg(id order by created_at))[1]  as keep_id,
           (array_agg(id order by created_at))[2:] as dup_ids
    from public.orders
    where status = 'active' and table_number <> 0
    group by restaurant_id, table_number
    having count(*) > 1
  loop
    update public.order_items set order_id = r.keep_id where order_id = any(r.dup_ids);
    update public.orders set status = 'cancelled', updated_at = now() where id = any(r.dup_ids);
    raise notice 'de-dupe: merged % extra active order(s) into % for restaurant % table %',
      array_length(r.dup_ids, 1), r.keep_id, r.restaurant_id, r.table_number;
  end loop;
end $$;

-- ── 1. Backfill — repair open orders whose total was clobbered ────────────
update public.orders o
   set total = coalesce((
         select sum(oi.item_price * oi.qty)
         from public.order_items oi
         where oi.order_id = o.id and oi.status <> 'void'
       ), 0)
 where o.status = 'active'
   and coalesce(o.source, 'staff') <> 'delivery';

-- ── 2. One active order per dine-in table ─────────────────────────────────
--   table_number = 0 is the takeaway / delivery bucket (many at once) — excluded.
--   A non-RPC path that tries to open a second active order for a table now
--   fails loudly with 23505 instead of silently double-booking it.
create unique index if not exists uniq_active_order_per_table
  on public.orders (restaurant_id, table_number)
  where status = 'active' and table_number <> 0;

-- ── 3. Trigger — orders.total follows its items ───────────────────────────
create or replace function public.recalc_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.recalc_order_total() is
  'Keeps orders.total = sum(non-void order_items) for open dine-in/guest orders. '
  'Row-level so it also fixes totals on item transfer/void; locks the parent order '
  'so concurrent sends serialise. A statement-level trigger with transition tables '
  'would re-sum once per statement instead of once per row — worth doing if the '
  'per-row cost ever shows up in pg_stat_statements.';

drop trigger if exists trg_recalc_order_total on public.order_items;
create trigger trg_recalc_order_total
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_total();

-- ── 4. Atomic send ───────────────────────────────────────────────────────
--   p_items: jsonb array of
--     { menu_item_id, item_name, item_price, qty, note, station_id }
--   p_item_status: 'sent' (staff — straight to the kitchen) or
--                  'pending' (guest / QR — waits for staff approval)
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

  -- Assign the order number exactly once, reusing the locked-counter helper.
  select order_num into v_order_num from public.orders where id = v_order_id;
  if v_order_num is null then
    v_order_num := public.guest_assign_order_number(p_restaurant_id, v_order_id);
  end if;

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
