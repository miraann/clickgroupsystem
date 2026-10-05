-- ============================================================
-- 20261005_01 — Offline edition (Windows desktop app, see offline/README.md)
-- ------------------------------------------------------------
-- offline_licenses  every licence / renewal code the seller panel issued, so
--                   the seller can see what each restaurant has and the
--                   export API can hand the latest one to a new install.
-- offline_installs  one row per PC that was set up (activated); its token
--                   lets that PC upload its sales. Only a hash is stored.
--
-- Both are only used by service-role API routes (/api/seller/offline-license,
-- /api/offline-cloud/*): RLS on, no policies, so no client key can read them.
-- Safe to run before or after the app deploy; nothing else depends on them.
-- ============================================================

begin;

create table if not exists public.offline_licenses (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  valid_until   date not null,
  code          text not null,
  note          text,
  issued_at     timestamptz not null default now()
);
create index if not exists offline_licenses_restaurant_idx on public.offline_licenses (restaurant_id, valid_until desc);
alter table public.offline_licenses enable row level security;

create table if not exists public.offline_installs (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  token_hash     text not null unique,     -- sha256 of the token the PC keeps
  created_at     timestamptz not null default now(),
  last_upload_at timestamptz,
  revoked_at     timestamptz
);
create index if not exists offline_installs_restaurant_idx on public.offline_installs (restaurant_id);
alter table public.offline_installs enable row level security;

revoke all on public.offline_licenses, public.offline_installs from anon, authenticated;

commit;
