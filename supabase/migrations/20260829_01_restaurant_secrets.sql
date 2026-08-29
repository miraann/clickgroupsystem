-- ============================================================
-- 20260829_01 — Move per-restaurant secrets out of restaurants.settings
-- ------------------------------------------------------------
-- restaurants.settings is read broadly by the app and (until migration 02)
-- is anon-readable. The login password hash and the owner PIN must not live
-- there. This table has RLS enabled and NO policies, so only the service role
-- (server routes) can ever touch it.
--
-- Run order: 01 (this) -> provision-auth-users.mjs -> 02 (tenant RLS).
-- ============================================================

create table if not exists public.restaurant_secrets (
  restaurant_id  uuid primary key references public.restaurants(id) on delete cascade,
  password_hash  text,          -- pbkdf2:<saltHex>:<hashHex>  (login password)
  owner_pin_hash text,          -- pbkdf2:<saltHex>:<hashHex>  (owner PIN)
  auth_secret    text,          -- random password for the restaurant's auth.users row
  updated_at     timestamptz default now()
);

alter table public.restaurant_secrets enable row level security;
-- Intentionally NO policies → unreachable by anon / authenticated. Service role only.

-- ── Backfill from the existing settings blob ─────────────────────────────────
-- settings.password is already pbkdf2-hashed by the current login route.
-- settings.owner_pin is still plaintext; it is re-hashed by the app on the
-- next successful owner login (verifySecret() handles the legacy path), or
-- hash it here if you prefer a hard cutover.
insert into public.restaurant_secrets (restaurant_id, password_hash, owner_pin_hash)
select
  r.id,
  nullif(r.settings->>'password', ''),
  nullif(r.settings->>'owner_pin', '')
from public.restaurants r
on conflict (restaurant_id) do update
  set password_hash  = coalesce(excluded.password_hash,  public.restaurant_secrets.password_hash),
      owner_pin_hash = coalesce(excluded.owner_pin_hash, public.restaurant_secrets.owner_pin_hash),
      updated_at     = now();

-- ── Public projection of restaurants ───────────────────────────────────────
-- Additive and safe to ship now. The guest menu / CFD / POS-login pages read
-- restaurant name+logo+slug through this instead of the restaurants table, so
-- migration 02 can drop anon SELECT on restaurants without breaking them.
-- Adjust the settings keys below to match your actual settings JSON.
create or replace view public.restaurant_public as
  select id, name, logo_url, menu_slug,
         settings->>'currency'         as currency,
         settings->>'default_language' as default_language
  from public.restaurants;
grant select on public.restaurant_public to anon, authenticated;

-- ── Strip the secrets from settings ─────────────────────────────────────────
-- Do this AFTER deploying the code that reads restaurant_secrets, so there is
-- no window where login can't find the password. Uncomment to run:
--
-- update public.restaurants
--   set settings = settings - 'password' - 'owner_pin'
--   where settings ? 'password' or settings ? 'owner_pin';
