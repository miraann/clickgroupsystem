-- ============================================================
-- 20260930_03 — Staff PINs: hashed, and out of the staff table
-- ------------------------------------------------------------
-- Run AFTER the build whose /api/pos/login and /api/settings/staff use
-- staffIdsWithPin (src/lib/staffPin.ts) — it falls back to the plaintext
-- column until this runs, so the order is: deploy, then this.
--
-- staff.pin was plaintext, and every staff device of a restaurant shares one
-- Supabase identity, so any cashier could `select pin from staff` and log in
-- as the manager. Now:
--   · staff_secrets(staff_id, restaurant_id, pin_hash) — bcrypt, RLS on with
--     no policies (service role only), same pattern as restaurant_secrets.
--   · trg_staff_hash_pin — any write of staff.pin (settings API, backup
--     restore, an old build) is hashed into staff_secrets and the column is
--     set to null. Existing PINs are migrated by the same trigger below.
--   · staff_pin_match(restaurant, pin) → uuid[] — compares inside Postgres;
--     service role only.
-- ============================================================

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.staff_secrets (
  -- deferred: the BEFORE INSERT trigger writes this row before the staff row exists
  staff_id      uuid primary key references public.staff(id) on delete cascade deferrable initially deferred,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  pin_hash      text not null,
  updated_at    timestamptz not null default now()
);
create index if not exists idx_staff_secrets_restaurant on public.staff_secrets(restaurant_id);

alter table public.staff_secrets enable row level security;  -- no policies: service role only
revoke all on public.staff_secrets from anon, authenticated;

create or replace function public.fn_staff_hash_pin()
returns trigger language plpgsql security definer set search_path = public, extensions
as $$
begin
  if new.pin is not null and btrim(new.pin) <> '' then
    insert into public.staff_secrets (staff_id, restaurant_id, pin_hash, updated_at)
    values (new.id, new.restaurant_id, crypt(btrim(new.pin), gen_salt('bf', 6)), now())
    on conflict (staff_id) do update
      set pin_hash = excluded.pin_hash, restaurant_id = excluded.restaurant_id, updated_at = now();
  end if;
  new.pin := null;
  return new;
end $$;
revoke all on function public.fn_staff_hash_pin() from public, anon, authenticated;

create or replace function public.staff_pin_match(p_restaurant_id uuid, p_pin text)
returns uuid[]
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(array_agg(s.staff_id), '{}')
  from public.staff_secrets s
  where s.restaurant_id = p_restaurant_id
    and s.pin_hash = crypt(btrim(p_pin), s.pin_hash)
$$;
revoke all on function public.staff_pin_match(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_pin_match(uuid, text) to service_role;

alter table public.staff alter column pin drop not null;

drop trigger if exists trg_staff_hash_pin on public.staff;
create trigger trg_staff_hash_pin
  before insert or update of pin on public.staff
  for each row execute function public.fn_staff_hash_pin();

-- Migrate every existing PIN through the trigger (hash → staff_secrets, column → null).
update public.staff set pin = pin where pin is not null;

notify pgrst, 'reload schema';

commit;
