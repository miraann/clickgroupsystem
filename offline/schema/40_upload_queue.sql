-- ============================================================
-- Offline edition — sales made on this PC wait here until it has internet,
-- then offline/runtime/upload.cjs sends them to the online system, so the
-- owner and the seller panel see them. One row per change; the uploader sends
-- each changed row's latest state once and then clears its entries.
-- Rows loaded at activation don't land here (they're copied with triggers off).
-- ============================================================
create table if not exists cg_offline.outbox (
  id        bigserial primary key,
  tbl       text not null,
  row_id    uuid not null,
  deleted   boolean not null default false,
  queued_at timestamptz not null default now()
);
create index if not exists outbox_row_idx on cg_offline.outbox (tbl, row_id);

-- security definer: the app's API roles write these tables but have no access
-- to cg_offline; the queue entry is written with the owner's rights.
create or replace function cg_offline.queue_upload() returns trigger
  language plpgsql
  security definer
  set search_path to cg_offline, pg_temp
as $$
begin
  insert into cg_offline.outbox (tbl, row_id, deleted)
  values (tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end, tg_op = 'DELETE');
  return null;
end $$;

-- The restaurant's day-to-day records. Menu, tables, staff and settings stay
-- as they came from the cloud and aren't uploaded.
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_items', 'invoices', 'expenses', 'pay_later', 'pay_later_payments', 'customers', 'members']
  loop
    execute format('drop trigger if exists cg_upload on public.%I', t);
    execute format('create trigger cg_upload after insert or update or delete on public.%I
                      for each row execute function cg_offline.queue_upload()', t);
  end loop;
end $$;
