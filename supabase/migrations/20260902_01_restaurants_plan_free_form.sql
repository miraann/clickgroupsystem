-- ============================================================
-- 20260902_01 — Let restaurants.plan hold any seller-defined plan slug
-- ------------------------------------------------------------
-- The base schema (supabase-schema.sql) pinned restaurants.plan to a fixed
-- CHECK: plan in ('starter', 'professional', 'enterprise'). Plans are now
-- seller-managed rows in public.plans (slugs like 'basic', 'vip'), so the
-- seller "Add Restaurant" insert (plan = a plans.slug) fails with
--   23514  new row for relation "restaurants" violates check constraint
--          "restaurants_plan_check"
-- which the API surfaces as the generic "Something went wrong."
--
-- Safe to run now: additive/relaxing only, no data rewrite. restaurants is
-- currently empty on this project.
-- ============================================================

alter table public.restaurants
  drop constraint if exists restaurants_plan_check;

-- Optional hard integrity (only if public.plans.slug is UNIQUE and every
-- existing restaurants.plan value matches a plans.slug — neither is
-- guaranteed, so this is left commented):
--
-- alter table public.plans add constraint plans_slug_key unique (slug);
-- alter table public.restaurants
--   add constraint restaurants_plan_fkey
--   foreign key (plan) references public.plans(slug) on update cascade;
