-- ============================================================
-- 20260909_02 — Restore public read for the guest menu / delivery pages
-- ------------------------------------------------------------
-- 20260829_02_tenant_rls.sql locked `anon` out of `restaurants` and
-- `menu_template_settings`. The public surfaces
--
--   /order/[slug]     delivery ordering
--   /r/[slug]         QR / browse menu
--   /guest/[tableId]  in-restaurant ordering
--
-- load the restaurant row + its branding through the SWR hook
-- `useRestaurantMenu`, which read those two tables DIRECTLY. Post-migration
-- both queries come back empty for an anonymous visitor, so the pages render
-- their "restaurant not found" fallback (a blank screen with a faint
-- crossed-cutlery icon).
--
-- Fix — WITHOUT re-opening a broad anon SELECT on `restaurants`:
--   1. `restaurant_public` also exposes a WHITELISTED slice of `settings`
--      (social links, delivery config, dine-in toggles). No `owner_name`,
--      no `modules`, no secrets — an allow-list, so unknown keys never leak.
--   2. `anon` gets SELECT back on `menu_template_settings` (styling only).
--
-- The app change that pairs with this: useRestaurantMenu reads
-- `restaurant_public` instead of `restaurants`. Apply this migration first,
-- then deploy the build.
-- ============================================================

-- ── 1. restaurant_public: append a safe `settings` slice ───────────────────
-- create-or-replace keeps the existing columns (id, name, logo_url,
-- menu_slug, currency, default_language) in place and only adds `settings`
-- at the end, as Postgres requires.
create or replace view public.restaurant_public as
  select
    r.id,
    r.name,
    r.logo_url,
    r.menu_slug,
    r.settings->>'currency'         as currency,
    r.settings->>'default_language' as default_language,
    coalesce(
      (select jsonb_object_agg(e.key, e.value)
         from jsonb_each(coalesce(r.settings, '{}'::jsonb)) as e(key, value)
        where e.key in (
          -- social / contact links (all three public pages)
          'facebook','instagram','snapchat','whatsapp','tiktok','twitter',
          'youtube','maps_url','website',
          -- delivery configuration (/order/[slug])
          'delivery_enabled','default_delivery_fee','min_order_amount',
          'estimated_delivery_time','free_delivery_above','delivery_note',
          'show_delivery_button',
          -- dine-in toggles (/guest/[tableId])
          'dine_in_note','show_call_waiter','enable_qr_ordering'
        )),
      '{}'::jsonb
    ) as settings
  from public.restaurants r;

grant select on public.restaurant_public to anon, authenticated;

-- ── 2. menu_template_settings: guest styling is public again ───────────────
-- Only an anon SELECT path is (re)added here; the dashboard's own
-- authenticated read/write policy is left untouched. Harmless no-op if RLS
-- is disabled on the table.
drop policy if exists "anon_read_menu_template_settings"   on public.menu_template_settings;
drop policy if exists "public_read_menu_template_settings" on public.menu_template_settings;
create policy "public_read_menu_template_settings"
  on public.menu_template_settings
  for select
  to anon
  using (true);
