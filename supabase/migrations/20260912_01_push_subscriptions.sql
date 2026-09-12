-- ============================================================
-- 20260912_01 — Formalize push_subscriptions (was never tracked)
-- ------------------------------------------------------------
-- push_subscriptions has existed live since supabase-delivery-notifications.sql
-- (which only ALTERs it to add staff_id) and api/push/subscribe + api/push/send,
-- but its base CREATE TABLE was created ad hoc in the SQL editor and never
-- committed. This migration is idempotent so it's safe to run against a
-- database that already has the table.
-- ============================================================

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id      uuid references public.staff(id) on delete cascade,
  endpoint      text not null unique,
  type          text not null check (type in ('fcm', 'web')),
  subscription  jsonb,
  created_at    timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists staff_id uuid references public.staff(id) on delete cascade;

create index if not exists idx_push_subs_restaurant on public.push_subscriptions(restaurant_id);
create index if not exists idx_push_subs_staff       on public.push_subscriptions(staff_id) where staff_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Trusted path (dashboard, PIN-staff, driver — all signed in as the
-- restaurant's provisioned auth user): full self-service on their own rows.
alter table public.push_subscriptions enable row level security;

drop policy if exists "tenant_push_subscriptions" on public.push_subscriptions;
create policy "tenant_push_subscriptions" on public.push_subscriptions for all to authenticated
  using      (restaurant_id in (select public.user_restaurant_ids()))
  with check  (restaurant_id in (select public.user_restaurant_ids()));

-- Untrusted path: api/push/send is also called from the anonymous guest-menu,
-- delivery-order, and waiter-call pages (no restaurant session) so it can
-- notify staff devices about the event the guest just triggered. That route
-- already scopes the query itself (.eq('restaurant_id', ...) and, for
-- driver dispatch, .eq('staff_id', ...)) and only fires off the back of a
-- verified recent row in orders/waiter_calls — this SELECT-only anon policy
-- is the same permissive-dev-RLS pattern already used for
-- delivery_notifications (see supabase-delivery-notifications.sql).
drop policy if exists "anon_select_push_subscriptions" on public.push_subscriptions;
create policy "anon_select_push_subscriptions" on public.push_subscriptions for select to anon
  using (true);
