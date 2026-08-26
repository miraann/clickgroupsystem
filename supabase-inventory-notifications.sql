-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory Notifications System — schema + triggers + atomic deduction RPC
-- Run this in your Supabase SQL editor (after supabase-inventory-schema.sql
-- and supabase-menu-ingredients.sql have already been applied).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Extend inventory_items: expiry / batch tracking + usage-rate tracking
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.inventory_items
  add column if not exists expiry_date         date,
  add column if not exists batch_number         text,
  add column if not exists last_restocked_at    timestamptz,
  add column if not exists avg_daily_usage      numeric not null default 0,
  add column if not exists usage_updated_at     timestamptz;

comment on column public.inventory_items.expiry_date      is 'Expiration date for perishable items (nullable — non-perishables leave this null)';
comment on column public.inventory_items.batch_number     is 'Optional lot/batch identifier for the current stock on hand';
comment on column public.inventory_items.avg_daily_usage   is 'Exponential moving average of daily consumption, used for rapid-depletion detection';

create index if not exists idx_inventory_items_expiry on public.inventory_items(expiry_date) where expiry_date is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. inventory_notifications table
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.inventory_notifications (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete cascade,
  type              text not null check (type in (
                      'low_stock', 'out_of_stock', 'expiring_soon', 'expired',
                      'rapid_depletion', 'restock', 'manual_adjustment'
                    )),
  severity          text not null check (severity in ('info', 'warning', 'critical')) default 'info',
  message           text not null,
  metadata          jsonb not null default '{}'::jsonb,
  is_read           boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.inventory_notifications enable row level security;

drop policy if exists "dev_inventory_notifications" on public.inventory_notifications;
create policy "dev_inventory_notifications"
  on public.inventory_notifications for all using (true) with check (true);

create index if not exists idx_inv_notif_restaurant       on public.inventory_notifications(restaurant_id, created_at desc);
create index if not exists idx_inv_notif_restaurant_unread on public.inventory_notifications(restaurant_id, is_read) where is_read = false;
create index if not exists idx_inv_notif_item              on public.inventory_notifications(inventory_item_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Stock-change trigger: low stock / out of stock / restock / rapid depletion
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_inventory_stock_notify()
returns trigger language plpgsql as $$
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

drop trigger if exists trg_inventory_stock_notify on public.inventory_items;
create trigger trg_inventory_stock_notify
  after update of current_stock on public.inventory_items
  for each row execute function public.fn_inventory_stock_notify();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Atomic order-payment deduction RPC
--    Row-locks each affected inventory item, deducts ingredient quantities,
--    updates the usage-rate EMA, and clamps at 0. Runs server-side only
--    (called from /api/payment/finalize) so concurrent payments can't race.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_deduct_inventory_for_order(p_order_id uuid, p_restaurant_id uuid)
returns void language plpgsql as $$
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Manual restock helper RPC (keeps last_restocked_at in sync; the
--    trigger above still fires the 'restock' notification automatically)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_restock_inventory_item(
  p_item_id uuid, p_new_stock numeric, p_batch_number text default null, p_expiry_date date default null
)
returns void language plpgsql as $$
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Daily expiry-check function — call once/day from a scheduler
--    (pg_cron, Supabase scheduled Edge Function, or Vercel Cron hitting
--    /api/inventory/check-expiry). Dedupes so re-runs the same day don't
--    spam duplicate notifications.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_inventory_expiry(p_warn_days integer default 3)
returns void language plpgsql as $$
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

-- Optional: if pg_cron is enabled on your Supabase project, schedule it directly:
-- select cron.schedule('inventory-expiry-check', '0 6 * * *', $$select public.check_inventory_expiry();$$);
