-- ============================================================
-- 20260913_04 — Security hardening follow-up
-- ------------------------------------------------------------
-- Closes three gaps found in a full-project security audit:
--
--   1. modifier_options / menu_item_modifiers / kds_station_categories
--      have no restaurant_id column, so migration 02's main tenant-RLS
--      loop skipped them — RLS was never enabled at all, meaning any
--      authenticated OR anon caller had full SELECT/INSERT/UPDATE/DELETE
--      on every restaurant's rows (Postgres/Supabase default-grants
--      public-schema tables to anon+authenticated; RLS is what restricts
--      that, and here it was simply off). This adds RLS + a parent-join
--      tenant policy, scoped through menu_modifiers / kds_stations
--      (both already restaurant_id-scoped). modifier_options and
--      menu_item_modifiers keep the anon SELECT migration 02 already
--      created for them (it was inert while RLS was off; enabling RLS
--      here activates it) — guest menu needs to read modifier choices.
--      kds_station_categories gets no anon policy: it's internal KDS
--      routing, never read by a guest page.
--
--   2. delivery_orders had an unconditional `anon select using (true)`
--      policy (from migration 02's guest-tracking allowance) — meant to
--      let a guest look up their own delivery by phone, but RLS can't
--      check "the caller supplied this phone in their query", only row
--      data, so any anon caller could read every restaurant's
--      delivery_orders in full: customer name, phone, address, GPS
--      coordinates. Replaced with a SECURITY DEFINER RPC that does the
--      phone match server-side (a client can no longer omit the
--      filter), joined with the order + its items so the guest-tracking
--      page needs one call instead of three. orders / order_items keep
--      their existing anon SELECT — they carry no customer PII, and
--      closing them fully would require moving the dine-in QR-order
--      flow (active-order lookup by table number) onto RPCs too, which
--      is a larger change tracked separately in docs/SECURITY_MIGRATION.md.
--
--   3. push_subscriptions had an unconditional `anon select using (true)`
--      policy added so api/push/send could read target devices for
--      unauthenticated guest-triggered notifications (delivery/waiter
--      call). That route already validates the event server-side, so it
--      has been switched to the service-role client instead (bypasses
--      RLS deliberately, like print/kitchen and print/receipt already
--      do) and no longer needs table-level anon access. This drops the
--      anon policy, closing a cross-tenant leak of every restaurant's
--      push endpoints / staff device links.
-- ============================================================

-- ── 1. RLS for the remaining menu child tables ─────────────────────────────
do $$
begin
  if to_regclass('public.modifier_options') is not null then
    execute 'alter table public.modifier_options enable row level security';
    execute 'drop policy if exists tenant_modifier_options on public.modifier_options';
    execute $p$
      create policy tenant_modifier_options on public.modifier_options for all to authenticated
        using ( modifier_id in (
          select id from public.menu_modifiers
          where restaurant_id in (select public.user_restaurant_ids())
        ))
        with check ( modifier_id in (
          select id from public.menu_modifiers
          where restaurant_id in (select public.user_restaurant_ids())
        ))
    $p$;
  end if;

  if to_regclass('public.menu_item_modifiers') is not null then
    execute 'alter table public.menu_item_modifiers enable row level security';
    execute 'drop policy if exists tenant_menu_item_modifiers on public.menu_item_modifiers';
    execute $p$
      create policy tenant_menu_item_modifiers on public.menu_item_modifiers for all to authenticated
        using ( modifier_id in (
          select id from public.menu_modifiers
          where restaurant_id in (select public.user_restaurant_ids())
        ))
        with check ( modifier_id in (
          select id from public.menu_modifiers
          where restaurant_id in (select public.user_restaurant_ids())
        ))
    $p$;
  end if;

  if to_regclass('public.kds_station_categories') is not null then
    execute 'alter table public.kds_station_categories enable row level security';
    execute 'drop policy if exists tenant_kds_station_categories on public.kds_station_categories';
    execute $p$
      create policy tenant_kds_station_categories on public.kds_station_categories for all to authenticated
        using ( station_id in (
          select id from public.kds_stations
          where restaurant_id in (select public.user_restaurant_ids())
        ))
        with check ( station_id in (
          select id from public.kds_stations
          where restaurant_id in (select public.user_restaurant_ids())
        ))
    $p$;
  end if;
end $$;

-- ── 2. Guest delivery-order tracking via RPC, close direct anon read ───────
create or replace function public.guest_track_delivery_orders(p_restaurant_id uuid, p_phone text)
returns jsonb
language sql security definer stable set search_path = public
as $$
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

revoke all on function public.guest_track_delivery_orders(uuid, text) from public;
grant execute on function public.guest_track_delivery_orders(uuid, text) to anon, authenticated;

drop policy if exists "public_read_delivery_orders" on public.delivery_orders;

-- ── 3. Drop the anon read on push_subscriptions (route now uses service role) ──
drop policy if exists "anon_select_push_subscriptions" on public.push_subscriptions;
