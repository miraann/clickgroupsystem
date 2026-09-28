-- ============================================================
-- 20260928_03 — Close every remaining anon read (C1 follow-up)
-- ------------------------------------------------------------
-- Run AFTER 20260928_02 and AFTER the build that:
--   · tracks QR guest orders via guest_order_items() (no orders/order_items read)
--   · places delivery orders with a client-generated id (no insert…select)
--   · tracks delivery status by polling guest_track_delivery_orders()
--   · validates coupons via guest_validate_discount_code()
--   · pairs the CFD with a real Supabase session (/api/cfd/pair)
--
-- What it does:
--   1. Drops anon SELECT on orders / order_items (the documented residual).
--   2. Re-creates the anon INSERT policies the guest surfaces need, narrowed
--      to what those surfaces actually write (a guest can no longer insert a
--      'paid' order or forge a staff audit entry).
--   3. Sweeps pg_policies for every other policy that is open to anon /
--      public / authenticated without checking the caller's identity, and
--      replaces it with a tenant-scoped policy. The repo's SQL files don't
--      account for all of them — the anon probe found open reads on
--      customers, members, delivery_orders, delivery_notifications,
--      audit_logs, push_subscriptions and role_messages that no migration
--      here created — so this works off the live catalog, not a name list.
--   4. Enables RLS on any table carrying restaurant_id that still has it off.
--
-- Every change is printed with RAISE NOTICE. Verify afterwards with
-- `select * from public.security_policy_report();` (service role) and the
-- anon probe in docs/SECURITY_MIGRATION.md.
-- ============================================================

begin;

-- ── 1. orders / order_items: no more anon read ─────────────────────────────
drop policy if exists public_read_orders      on public.orders;
drop policy if exists public_read_order_items on public.order_items;

-- ── 2. The anon writes the guest surfaces actually make ────────────────────
-- /order/[slug] delivery checkout: an active 'delivery' order + pending items
-- + its delivery_orders row. /guest/[tableId] goes through the
-- pos_send_to_kitchen RPC (definer), so it needs no direct INSERT.
drop policy if exists public_insert_orders on public.orders;
create policy public_insert_orders on public.orders for insert to anon
  with check (source in ('guest', 'delivery') and status = 'active');

drop policy if exists public_insert_order_items on public.order_items;
create policy public_insert_order_items on public.order_items for insert to anon
  with check (status = 'pending');

drop policy if exists public_insert_delivery_orders on public.delivery_orders;
create policy public_insert_delivery_orders on public.delivery_orders for insert to anon
  with check (status = 'pending');

drop policy if exists public_insert_waiter_calls on public.waiter_calls;
create policy public_insert_waiter_calls on public.waiter_calls for insert to anon
  with check (true);

drop policy if exists public_insert_customer_feedback on public.customer_feedback;
create policy public_insert_customer_feedback on public.customer_feedback for insert to anon
  with check (true);

-- logAudit() from the public pages — only the three guest event types.
-- (RLS + the dashboard's tenant policy on audit_logs come from the sweep.)
drop policy if exists public_insert_audit_logs on public.audit_logs;
create policy public_insert_audit_logs on public.audit_logs for insert to anon
  with check (action in ('guest_order', 'waiter_call', 'delivery_order'));

-- ── 3. Parent-scoped tenant policies for child tables without restaurant_id ─
do $$
begin
  if to_regclass('public.printer_categories') is not null then
    execute 'alter table public.printer_categories enable row level security';
    execute 'drop policy if exists tenant_printer_categories on public.printer_categories';
    execute $p$
      create policy tenant_printer_categories on public.printer_categories for all to authenticated
        using (exists (select 1 from public.printers p
                       where p.id = printer_categories.printer_id and p.restaurant_id in (select public.user_restaurant_ids())))
        with check (exists (select 1 from public.printers p
                       where p.id = printer_categories.printer_id and p.restaurant_id in (select public.user_restaurant_ids())))
    $p$;
  end if;

  if to_regclass('public.pay_later_payments') is not null then
    execute 'alter table public.pay_later_payments enable row level security';
    execute 'drop policy if exists tenant_pay_later_payments on public.pay_later_payments';
    execute $p$
      create policy tenant_pay_later_payments on public.pay_later_payments for all to authenticated
        using (exists (select 1 from public.pay_later pl
                       where pl.id = pay_later_id and pl.restaurant_id in (select public.user_restaurant_ids())))
        with check (exists (select 1 from public.pay_later pl
                       where pl.id = pay_later_id and pl.restaurant_id in (select public.user_restaurant_ids())))
    $p$;
  end if;
end $$;

-- ── 4. The sweep ───────────────────────────────────────────────────────────
do $$
declare
  -- The only anon policies that should exist afterwards (all from migrations
  -- 02 / 20260909_02 / 20260928_02 / this file).
  keep text[] := array[
    'public_read_menu_categories', 'public_read_menu_items', 'public_read_currencies',
    'public_read_events_offers', 'public_read_tables', 'public_read_table_groups',
    'public_read_menu_modifiers', 'public_read_modifier_options',
    'public_read_menu_item_modifiers', 'public_read_kitchen_notes',
    'public_read_combo_discounts', 'public_read_menu_template_settings',
    'public_read_kds_stations', 'public_read_kds_station_categories',
    'public_insert_orders', 'public_insert_order_items', 'public_insert_delivery_orders',
    'public_insert_waiter_calls', 'public_insert_customer_feedback', 'public_insert_audit_logs'
  ];
  -- A predicate that consults the caller's identity is "scoped": it can never
  -- match for anon, and for authenticated it is the tenant check itself.
  scoped_re constant text := '(auth\.(uid|jwt|role)\s*\(|user_restaurant_ids\s*\()';
  r record;
  t text;
  has_rid boolean;
  -- Seeded with the tables migration 02's tenant loop missed (it listed
  -- 'audit_log' / 'pay_later_orders', which don't exist) or that the anon
  -- probe found open, so each is guaranteed a tenant policy in 4c.
  touched text[] := array[
    'audit_logs', 'delivery_notifications', 'discount_codes', 'inventory_notifications',
    'pay_later', 'whatsapp_templates', 'whatsapp_logs', 'table_recoveries',
    'customers', 'members', 'delivery_orders', 'push_subscriptions', 'role_messages'
  ];
begin
  -- 4a. RLS still off on a tenant table → turn it on (tenant policy below).
  for r in
    select c.relname::text as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = r.tbl and column_name = 'restaurant_id') then
      execute format('alter table public.%I enable row level security', r.tbl);
      touched := touched || r.tbl;
      raise notice 'RLS enabled on %', r.tbl;
    else
      raise notice 'REVIEW: RLS is off on % (no restaurant_id — left as is)', r.tbl;
    end if;
  end loop;

  -- 4b. Open policies.
  for r in
    select p.tablename::text as tbl, p.policyname::text as pol, p.roles::text[] as roles, p.cmd
    from pg_policies p
    where p.schemaname = 'public'
      and p.roles && array['anon', 'public', 'authenticated']::name[]
      and not (p.policyname = any(keep))
      and coalesce(p.qual, '')       !~* scoped_re
      and coalesce(p.with_check, '') !~* scoped_re
  loop
    has_rid := exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = r.tbl and column_name = 'restaurant_id');

    if has_rid or exists (
      -- child table that already has a scoped policy covering every command
      select 1 from pg_policies s
      where s.schemaname = 'public' and s.tablename = r.tbl and s.cmd = 'ALL'
        and s.policyname <> r.pol
        and (coalesce(s.qual, '') ~* scoped_re)
    ) then
      execute format('drop policy %I on public.%I', r.pol, r.tbl);
      touched := touched || r.tbl;
      raise notice 'dropped open policy "%" on % (roles %, %)', r.pol, r.tbl, r.roles, r.cmd;
    else
      -- No tenant column and no scoped replacement: keep it for signed-in
      -- users (so nothing in the dashboard breaks) but take anon off it.
      execute format('alter policy %I on public.%I to authenticated', r.pol, r.tbl);
      raise notice 'REVIEW: open policy "%" on % narrowed to authenticated only', r.pol, r.tbl;
    end if;
  end loop;

  -- 4c. Every tenant table we touched gets a tenant policy for all commands,
  --     unless it already has a scoped one (e.g. tenant_order_items' parent join).
  for t in select distinct x from unnest(touched) x loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'restaurant_id') then
      continue;
    end if;
    if exists (select 1 from pg_policies s
               where s.schemaname = 'public' and s.tablename = t and s.cmd = 'ALL'
                 and coalesce(s.qual, '') ~* scoped_re) then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'tenant_' || t, t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using      (restaurant_id in (select public.user_restaurant_ids()))
        with check (restaurant_id in (select public.user_restaurant_ids()))
    $f$, 'tenant_' || t, t);
    raise notice 'created tenant policy on %', t;
  end loop;
end $$;

commit;
