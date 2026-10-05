-- ============================================================
-- Offline edition — the pieces Supabase normally provides outside the
-- `public` schema dump: the sign-up → profile trigger, and the change feed
-- that stands in for Supabase Realtime's postgres_changes.
-- Runs once, after 10_public.sql.
-- ============================================================

-- ── auth.users → public.profiles ──────────────────────────────────────────
-- restaurants.owner_id references profiles(id). On Supabase this trigger lives
-- in the `auth` schema, so the public-only dump does not carry it.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Change feed for the gateway (offline/runtime/realtime.cjs) ───────────
-- Every row change is sent as NOTIFY on `cg_realtime`; the gateway LISTENs and
-- forwards it to subscribed browsers in Supabase's postgres_changes format.
create or replace function public.cg_realtime_notify() returns trigger
  language plpgsql
  set search_path to 'public'
as $$
declare
  -- Not named new/old: a variable called `old` would shadow the OLD record.
  _rec  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  _prev jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  _ts   text  := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  _msg  text;
begin
  _msg := jsonb_build_object(
    'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
    'commit_timestamp', _ts, 'record', _rec, 'old_record', _prev)::text;

  -- NOTIFY payloads are capped at 8000 bytes. Keep only the short columns
  -- (ids, numbers, status…) so subscription filters still match, and let the
  -- gateway re-read the full row by id.
  if octet_length(_msg) > 7800 then
    _msg := jsonb_build_object(
      'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
      'commit_timestamp', _ts, 'truncated', true,
      'record',     (select jsonb_object_agg(key, value) from jsonb_each(_rec)  where octet_length(value::text) <= 200),
      'old_record', (select jsonb_object_agg(key, value) from jsonb_each(_prev) where octet_length(value::text) <= 200))::text;
  end if;
  if octet_length(_msg) > 7800 then
    _msg := jsonb_build_object(
      'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
      'commit_timestamp', _ts, 'truncated', true,
      'record',     case when _rec  is not null then jsonb_build_object('id', _rec  -> 'id') end,
      'old_record', case when _prev is not null then jsonb_build_object('id', _prev -> 'id') end)::text;
  end if;

  perform pg_notify('cg_realtime', _msg);
  return null;
end $$;

-- Adds the feed trigger to every public table that lacks it. Later migrations
-- that create tables call this again. Secret tables are left out because the
-- feed is not filtered by row-level security.
create or replace function public.cg_realtime_attach_all() returns void
  language plpgsql
  set search_path to 'public'
as $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relispartition
       and c.relname not in ('restaurant_secrets', 'staff_secrets', 'push_subscriptions')
       and not exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'cg_realtime')
  loop
    execute format(
      'create trigger cg_realtime after insert or update or delete on public.%I
         for each row execute function public.cg_realtime_notify()', t.relname);
  end loop;
end $$;

-- The dump's default privileges make new public functions callable by the API
-- roles; these two are internal.
revoke all on function public.cg_realtime_notify()     from public, anon, authenticated, service_role;
revoke all on function public.cg_realtime_attach_all() from public, anon, authenticated, service_role;

select public.cg_realtime_attach_all();
