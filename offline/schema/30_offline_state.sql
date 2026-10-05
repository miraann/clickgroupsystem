-- ============================================================
-- Offline edition — this PC's own settings that aren't restaurant data:
-- the licence code, the latest time the PC has seen (a clock set back can't
-- stretch a licence), and the link used to upload sales to the cloud.
-- Only the backend reads it; cg_offline isn't exposed through the API.
-- ============================================================
create table if not exists cg_offline.state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
