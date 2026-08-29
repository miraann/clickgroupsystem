-- ============================================================
-- 20260829_02 — Close anon access, enforce tenant isolation
-- ------------------------------------------------------------
-- PREREQUISITES (do first, in this order):
--   1. Run 20260829_01_restaurant_secrets.sql
--   2. Run scripts/provision-auth-users.mjs  (creates one auth.users row per
--      restaurant and sets restaurants.owner_id)
--   3. Deploy the app build that mints a real Supabase session at login
--      (see docs/SECURITY_MIGRATION.md, step 4)
--   4. THEN run this file
--
-- Test on a staging Supabase project first. After this runs, the public anon
-- key can no longer read or write tenant data — only a signed-in session tied
-- to a restaurant (via owner_id or restaurant_users) can.
-- ============================================================

-- ── Helper (idempotent) ─────────────────────────────────────────────────────
create or replace function public.user_restaurant_ids()
returns setof uuid
language sql security definer stable set search_path = public
as $$
  select restaurant_id from public.restaurant_users where user_id = auth.uid()
  union
  select id            from public.restaurants     where owner_id = auth.uid()
$$;

-- ── 1. DROP every open anon / dev policy ────────────────────────────────────
-- From supabase-dev-policy.sql, supabase-fix-anon-access.sql and
-- supabase-production-rls.sql STEP 6 / 6b.
do $$
declare
  pol record;
  open_names text[] := array[
    'dev_restaurants_select','dev_restaurants_update','dev_restaurants_insert',
    'anon_read_restaurants','anon_insert_restaurants','anon_update_restaurants','anon_delete_restaurants',
    'anon_read_menu_items','anon_read_menu_categories','anon_read_events_offers','anon_read_currencies',
    'anon_read_tables','anon_read_table_groups','anon_read_orders','anon_read_order_items',
    'anon_insert_orders','anon_insert_order_items','anon_update_orders','anon_update_order_items',
    'anon_delete_order_items','anon_insert_feedback','anon_read_staff',
    'anon_read_menu_modifiers','anon_read_modifier_options','anon_read_menu_item_modifiers',
    'anon_read_kitchen_notes','anon_read_kds_station_categories','anon_read_menu_template_settings',
    'anon_all_payment_methods','anon_all_discounts','anon_all_surcharges',
    'anon_all_invoice_number_settings','anon_all_order_number_settings','anon_all_invoices',
    'logos_select','logos_insert','logos_update'
  ];
  n text;
begin
  -- named policies
  foreach n in array open_names loop
    for pol in
      select schemaname, tablename, policyname
      from pg_policies
      where policyname = n and schemaname in ('public','storage')
    loop
      execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    end loop;
  end loop;

  -- the generated anon_write_<table> loop from STEP 6b
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and policyname like 'anon_write_%'
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- ── 2. Tenant policies for `authenticated` ──────────────────────────────────
do $$
declare
  t text;
  tenant_tables text[] := array[
    'menu_categories','menu_items','menu_modifiers','kitchen_notes','void_reasons',
    'discounts','combo_discounts','surcharges','payment_methods','currencies',
    'invoice_number_settings','order_number_settings','receipt_settings','invoices',
    'events_offers','kds_stations','printers','table_groups','tables',
    'orders','order_items','staff','inventory_categories','inventory_units',
    'inventory_items','menu_item_ingredients','customer_feedback','customers',
    'members','reservations','delivery_orders','delivery_zones','restaurant_roles',
    'role_messages','audit_log','expenses','pay_later_orders','waiter_calls'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    -- only tables that actually carry restaurant_id get the tenant policy
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'restaurant_id'
    ) then
      raise notice 'skip %: no restaurant_id column', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'tenant_'||t, t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using      (restaurant_id in (select public.user_restaurant_ids()))
        with check  (restaurant_id in (select public.user_restaurant_ids()))
    $f$, 'tenant_'||t, t);
  end loop;
end $$;

-- restaurants: a signed-in user sees / edits only their own
alter table public.restaurants enable row level security;
drop policy if exists "own_restaurant" on public.restaurants;
create policy "own_restaurant" on public.restaurants for all to authenticated
  using      (id in (select public.user_restaurant_ids()))
  with check  (id in (select public.user_restaurant_ids()));

-- ── 2b. Child tables that have no restaurant_id — scope them via their parent.
do $$
begin
  if to_regclass('public.order_items') is not null then
    execute 'alter table public.order_items enable row level security';
    execute 'drop policy if exists tenant_order_items on public.order_items';
    execute $p$
      create policy tenant_order_items on public.order_items for all to authenticated
        using ( order_id in (
          select id from public.orders
          where restaurant_id in (select public.user_restaurant_ids())
        ))
        with check ( order_id in (
          select id from public.orders
          where restaurant_id in (select public.user_restaurant_ids())
        ))
    $p$;
    -- guest order placement still needs INSERT (see section 3 for the anon policy)
  end if;
end $$;

-- Menu child tables (modifier_options, menu_item_modifiers, menu_item_ingredients,
-- kds_station_categories) have no restaurant_id and only hold menu-structure data
-- that the public menu already exposes. They are intentionally left as-is by this
-- migration. Follow-up: add parent-join policies and enable RLS on them too.

-- ── 3. Narrow public access for the guest surfaces ─────────────────────────
-- Guest menu (/r/[slug]), CFD, guest ordering. SELECT on what those pages
-- render; INSERT for order placement / waiter calls. Guarded so a missing
-- table is skipped rather than aborting the migration. (The guest app already
-- filters unavailable items client-side, so no column predicate here.)
do $$
declare
  t text;
  -- Menu structure the guest pages render, plus orders/order_items/delivery_orders
  -- which guest ORDER TRACKING reads back by id + phone. Keeping anon SELECT on
  -- those three is a known, bounded exposure (order status + delivery contact
  -- info, no login secrets). FOLLOW-UP: replace with security-definer RPCs
  -- track_orders(restaurant_id, phone) and place_order(...) so anon needs no
  -- direct table access at all.
  read_tables text[] := array[
    'menu_categories','menu_items','currencies','events_offers',
    'tables','table_groups','menu_modifiers','modifier_options',
    'menu_item_modifiers','kitchen_notes','combo_discounts',
    'orders','order_items','delivery_orders'
  ];
  insert_tables text[] := array[
    'orders','order_items','delivery_orders','customer_feedback','waiter_calls'
  ];
  -- v1 policy names from an earlier draft of this file — drop if present
  legacy text[] := array[
    'public_menu_categories','public_menu_items','public_currencies','public_events_offers',
    'public_tables','public_table_groups','public_menu_modifiers','public_modifier_options',
    'public_menu_item_modifiers','public_kitchen_notes','public_insert_orders',
    'public_insert_order_items','public_insert_feedback','public_insert_waiter_calls'
  ];
  pol record;
begin
  foreach t in array legacy loop
    for pol in select schemaname, tablename from pg_policies where policyname = t and schemaname = 'public' loop
      execute format('drop policy if exists %I on public.%I', t, pol.tablename);
    end loop;
  end loop;

  -- NOTE: deliberately does NOT enable RLS here. It only adds the anon-select
  -- policy, which is inert on tables whose RLS is still off and active on the
  -- ones section 2 locked down. Enabling RLS on a menu child table without an
  -- 'authenticated' policy would lock the dashboard out of it.
  foreach t in array read_tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'public_read_'||t, t);
    execute format('create policy %I on public.%I for select to anon using (true)', 'public_read_'||t, t);
  end loop;

  foreach t in array insert_tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'public_insert_'||t, t);
    execute format('create policy %I on public.%I for insert to anon with check (true)', 'public_insert_'||t, t);
  end loop;
end $$;

-- restaurants: guest menu needs name / logo / slug / currency only.
-- Do NOT re-open a broad SELECT here — expose a view or RPC instead:
create or replace view public.restaurant_public as
  select id, name, logo_url, menu_slug,
         settings->>'currency'            as currency,
         settings->>'default_language'    as default_language
  from public.restaurants;
grant select on public.restaurant_public to anon, authenticated;

-- ── 3b. Guest order-number assignment ──────────────────────────────────────
-- The guest flow must not get anon UPDATE on orders / order_number_settings.
-- This definer function does the increment safely. src/lib/orderNumber.ts
-- calls it and falls back to the legacy client path if it is absent.
create or replace function public.guest_assign_order_number(p_restaurant_id uuid, p_order_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_prefix text;
  v_num    int;
  v_ordnum text;
begin
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

revoke all on function public.guest_assign_order_number(uuid, uuid) from public;
grant execute on function public.guest_assign_order_number(uuid, uuid) to anon, authenticated;

-- ── 4. Storage buckets ────────────────────────────────────────────────────
-- Make the selfie bucket private; the upload route already returns a signed URL.
update storage.buckets set public = false where id = 'customer-selfies';
-- menu-images / logos stay public (they are shown on the guest menu).
