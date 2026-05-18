-- ─────────────────────────────────────────────────────────────────────────────
-- Discount Coupon Codes — migration
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.discount_codes (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id    UUID         NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code             TEXT         NOT NULL,
  discount_type    TEXT         NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value   NUMERIC(10,2) NOT NULL,
  min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses         INTEGER      DEFAULT NULL,        -- NULL = unlimited
  used_count       INTEGER      NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ  DEFAULT NULL,         -- NULL = never expires
  active           BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

-- Atomic increment used when a customer successfully places an order
CREATE OR REPLACE FUNCTION public.increment_discount_code(p_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.discount_codes SET used_count = used_count + 1 WHERE id = p_id;
END;
$$;
