-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-Flight Check: Delivery + Inventory notification/RPC layer
-- Run in the Supabase SQL editor before deploying app code that depends on
-- supabase-delivery-notifications.sql / supabase-inventory-notifications.sql.
-- Pure read-only verification — no schema is modified. Every check reports
-- PASS/FAIL as a row; scan the output for any 'FAIL'.
-- ─────────────────────────────────────────────────────────────────────────────

with expected_tables as (
  select * from (values
    ('delivery_notifications'),
    ('inventory_notifications'),
    ('push_subscriptions'),
    ('delivery_orders'),
    ('delivery_zones')
  ) as t(table_name)
),
table_check as (
  select
    e.table_name,
    'TABLE' as kind,
    case when t.table_name is not null then 'PASS' else 'FAIL' end as status
  from expected_tables e
  left join information_schema.tables t
    on t.table_schema = 'public' and t.table_name = e.table_name
),

expected_columns as (
  select * from (values
    ('delivery_notifications', 'recipient_type'),
    ('delivery_notifications', 'delivery_order_id'),
    ('delivery_notifications', 'is_read'),
    ('push_subscriptions',     'staff_id'),
    ('delivery_zones',         'center_lat'),
    ('delivery_zones',         'center_lng'),
    ('delivery_zones',         'radius_meters'),
    ('delivery_zones',         'polygon'),
    ('delivery_orders',        'driver_id'),
    ('delivery_orders',        'driver_name'),
    ('delivery_orders',        'address_text'),
    ('inventory_items',        'avg_daily_usage'),
    ('inventory_items',        'expiry_date')
  ) as t(table_name, column_name)
),
column_check as (
  select
    ec.table_name || '.' || ec.column_name as table_name,
    'COLUMN' as kind,
    case when c.column_name is not null then 'PASS' else 'FAIL' end as status
  from expected_columns ec
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = ec.table_name and c.column_name = ec.column_name
),

expected_functions as (
  select * from (values
    ('fn_match_delivery_zone'),
    ('fn_haversine_meters'),
    ('fn_point_in_polygon'),
    ('fn_delivery_status_notify'),
    ('fn_delivery_order_placed_notify'),
    ('fn_deduct_inventory_for_order'),
    ('fn_inventory_stock_notify'),
    ('fn_restock_inventory_item'),
    ('check_inventory_expiry')
  ) as t(routine_name)
),
function_check as (
  select
    ef.routine_name as table_name,
    'FUNCTION' as kind,
    case when r.routine_name is not null then 'PASS' else 'FAIL' end as status
  from expected_functions ef
  left join information_schema.routines r
    on r.routine_schema = 'public' and r.routine_name = ef.routine_name and r.routine_type = 'FUNCTION'
),

expected_triggers as (
  select * from (values
    ('trg_delivery_status_notify',       'delivery_orders'),
    ('trg_delivery_order_placed_notify', 'delivery_orders'),
    ('trg_inventory_stock_notify',       'inventory_items')
  ) as t(trigger_name, table_name)
),
trigger_check as (
  select
    et.trigger_name || ' on ' || et.table_name as table_name,
    'TRIGGER' as kind,
    case when tg.trigger_name is not null then 'PASS' else 'FAIL' end as status
  from expected_triggers et
  left join information_schema.triggers tg
    on tg.trigger_schema = 'public' and tg.trigger_name = et.trigger_name and tg.event_object_table = et.table_name
),

expected_indexes as (
  select * from (values
    ('idx_delivery_notif_restaurant'),
    ('idx_delivery_notif_order'),
    ('idx_delivery_notif_recipient'),
    ('idx_push_subs_staff'),
    ('idx_delivery_zones_active'),
    ('idx_inv_notif_restaurant'),
    ('idx_inv_notif_restaurant_unread'),
    ('idx_inv_notif_item')
  ) as t(indexname)
),
index_check as (
  select
    ei.indexname as table_name,
    'INDEX' as kind,
    case when i.indexname is not null then 'PASS' else 'FAIL' end as status
  from expected_indexes ei
  left join pg_indexes i
    on i.schemaname = 'public' and i.indexname = ei.indexname
),

rls_check as (
  select
    c.relname as table_name,
    'RLS_ENABLED' as kind,
    case when c.relrowsecurity then 'PASS' else 'FAIL' end as status
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('delivery_notifications', 'inventory_notifications', 'push_subscriptions')
),

realtime_check as (
  select
    'delivery_notifications' as table_name,
    'REALTIME_PUBLICATION' as kind,
    case when exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'delivery_notifications'
    ) then 'PASS' else 'WARN (publication not found — dashboard-managed Realtime is fine too)' end as status
),

fk_check as (
  select
    'push_subscriptions.staff_id -> staff.id' as table_name,
    'FOREIGN_KEY' as kind,
    case when exists (
      select 1
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_name = 'push_subscriptions'
        and kcu.column_name = 'staff_id'
        and ccu.table_name = 'staff'
    ) then 'PASS' else 'FAIL' end as status
),

all_checks as (
  select * from table_check
  union all select * from column_check
  union all select * from function_check
  union all select * from trigger_check
  union all select * from index_check
  union all select * from rls_check
  union all select * from realtime_check
  union all select * from fk_check
)

select kind, table_name as object_name, status
from all_checks
order by
  case when status like 'FAIL%' then 0 when status like 'WARN%' then 1 else 2 end,
  kind, object_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Functional smoke test: call the RPCs directly (no side effects on writes,
-- fn_deduct_inventory_for_order is skipped here since it mutates stock —
-- see the "dry run" note below instead).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Haversine sanity check: Baghdad center to a point ~1.1km away
select
  'fn_haversine_meters' as fn,
  fn_haversine_meters(33.3128, 44.3615, 33.3220, 44.3615) as meters,
  case when fn_haversine_meters(33.3128, 44.3615, 33.3220, 44.3615) between 900 and 1200
       then 'PASS (~1km as expected)' else 'FAIL (unexpected distance)' end as status;

-- 2. Point-in-polygon sanity check: a point clearly inside a simple square
select
  'fn_point_in_polygon' as fn,
  fn_point_in_polygon(
    0.5, 0.5,
    '[{"lat":0,"lng":0},{"lat":0,"lng":1},{"lat":1,"lng":1},{"lat":1,"lng":0}]'::jsonb
  ) as inside,
  case when fn_point_in_polygon(
    0.5, 0.5,
    '[{"lat":0,"lng":0},{"lat":0,"lng":1},{"lat":1,"lng":1},{"lat":1,"lng":0}]'::jsonb
  ) then 'PASS' else 'FAIL' end as status;

-- 3. Zone matcher — replace the restaurant_id with a real one from your project
--    to confirm it returns a row (or null if no zone covers that point, which
--    is also valid — just confirm it doesn't error).
-- select * from fn_match_delivery_zone(
--   (select id from restaurants limit 1),
--   33.3128, 44.3615
-- );

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_deduct_inventory_for_order — DRY RUN NOTE
-- This function mutates inventory_items.current_stock, so do not call it
-- directly against production data here. Instead, confirm it exists and is
-- wired to /api/payment/finalize (already covered by the FUNCTION check
-- above); exercise it via a real test order + payment in a staging restaurant.
-- ─────────────────────────────────────────────────────────────────────────────
