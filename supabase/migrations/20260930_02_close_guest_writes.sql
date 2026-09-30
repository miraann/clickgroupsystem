-- ============================================================
-- 20260930_02 — Close the direct anon writes and loose RPC grants
-- ------------------------------------------------------------
-- Run AFTER 20260930_01 and AFTER the build that places delivery orders
-- through guest_place_delivery_order (an older tab still open on
-- /order/[slug] fails to place its order until reloaded).
--
--   1. Guests no longer INSERT into orders / order_items / delivery_orders /
--      audit_logs directly — the definer RPCs from 20260930_01 do it with
--      server-side prices, and write the audit entries themselves.
--   2. increment_discount_code — anon could burn any restaurant's coupon
--      (SECURITY DEFINER, no search_path, EXECUTE to PUBLIC). Coupons are
--      counted inside guest_place_delivery_order now; dropped.
--   3. guest_assign_order_number — only called from inside the definer RPCs
--      and by staff; anon loses EXECUTE, and a signed-in caller must belong
--      to the restaurant.
--   4. Other functions anon could execute by default:
--        check_inventory_expiry        → service role only (daily cron)
--        fn_deduct_inventory_for_order → signed-in staff only
--        fn_restock_inventory_item     → signed-in staff only
--        fn_match_delivery_zone        → unused since delivery zones were
--                                        removed from the checkout
-- ============================================================

begin;

-- ── 1. Direct anon writes ─────────────────────────────────────────────────
drop policy if exists public_insert_orders          on public.orders;
drop policy if exists public_insert_order_items     on public.order_items;
drop policy if exists public_insert_delivery_orders on public.delivery_orders;
drop policy if exists public_insert_audit_logs      on public.audit_logs;

-- ── 2. Coupon counter ─────────────────────────────────────────────────────
drop function if exists public.increment_discount_code(uuid);

-- ── 3. Order numbers ──────────────────────────────────────────────────────
create or replace function public.guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
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

revoke all     on function public.guest_assign_order_number(uuid, uuid) from public, anon;
grant  execute on function public.guest_assign_order_number(uuid, uuid) to authenticated;

-- ── 4. Default EXECUTE grants ─────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.check_inventory_expiry(integer)') is not null then
    revoke all on function public.check_inventory_expiry(integer) from public, anon, authenticated;
    grant execute on function public.check_inventory_expiry(integer) to service_role;
  end if;
  if to_regprocedure('public.fn_deduct_inventory_for_order(uuid, uuid)') is not null then
    revoke all on function public.fn_deduct_inventory_for_order(uuid, uuid) from public, anon;
    grant execute on function public.fn_deduct_inventory_for_order(uuid, uuid) to authenticated;
  end if;
  if to_regprocedure('public.fn_match_delivery_zone(uuid, double precision, double precision)') is not null then
    revoke all on function public.fn_match_delivery_zone(uuid, double precision, double precision) from public, anon, authenticated;
  end if;
end $$;

-- fn_restock_inventory_item's argument list differs between installs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_restock_inventory_item'
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
