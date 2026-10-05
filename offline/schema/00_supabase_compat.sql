-- ============================================================
-- Offline edition — the small slice of Supabase that 10_public.sql (a
-- pg_dump of the cloud `public` schema) depends on: the API roles PostgREST
-- switches into, the `extensions` schema, and minimal `auth` / `storage`
-- schemas. Runs once on a freshly initdb'd cluster, before 10_public.sql.
-- ============================================================

-- The dump recreates `public` itself.
drop schema if exists public cascade;

-- ── Roles (same names as Supabase, so the dumped grants + RLS apply) ───────
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role supabase_admin nologin;
-- PostgREST logs in as `authenticator` and SET ROLEs per request from the JWT
-- `role` claim. Its password is set by the runtime (secrets.json).
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

-- ── Extensions (Supabase keeps them in `extensions`) ──────────────────────
create schema extensions;
create extension pgcrypto    with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter database postgres set search_path = "$user", public, extensions;

-- ── auth ──────────────────────────────────────────────────────────────────
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,                       -- bcrypt, same as GoTrue
  raw_app_meta_data  jsonb not null default '{"provider":"email","providers":["email"]}',
  raw_user_meta_data jsonb not null default '{}',
  email_confirmed_at timestamptz default now(),
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table auth.refresh_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  revoked_at timestamptz,                        -- rotated / signed out
  created_at timestamptz not null default now()
);
create index on auth.refresh_tokens (session_id);

-- Same definitions Supabase ships: read the claims PostgREST puts in
-- `request.jwt.claims` for the current request.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.email() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

-- ── storage (only the helper the dumped policies / functions call) ────────
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

grant execute on all functions in schema storage to anon, authenticated, service_role;
