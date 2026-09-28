-- ============================================================
-- 20260928_01 — Step 6 of the C1 runbook: secrets out of settings, for good
-- ------------------------------------------------------------
-- The login password and owner PIN live only in restaurant_secrets
-- (service-role only). restaurants.settings is tenant-writable (any staff of
-- the restaurant shares its auth user), so a password/owner_pin key there must
-- never exist — the login routes no longer read it, and this trigger makes
-- sure nothing can write it back.
--
-- Safe to run any time after 20260829_01; idempotent.
-- ============================================================

-- 1. Strip whatever is still there (prod had none left on 2026-09-28).
update public.restaurants
   set settings = settings - 'password' - 'owner_pin'
 where settings ? 'password' or settings ? 'owner_pin';

-- 2. Strip on every future write, whoever the caller is.
create or replace function public.strip_restaurant_settings_secrets()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.settings is not null then
    new.settings := new.settings - 'password' - 'owner_pin';
  end if;
  return new;
end;
$$;

drop trigger if exists strip_settings_secrets on public.restaurants;
create trigger strip_settings_secrets
  before insert or update of settings on public.restaurants
  for each row execute function public.strip_restaurant_settings_secrets();
