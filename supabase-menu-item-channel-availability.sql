-- Add per-channel availability flags to menu_items
-- available_delivery: controls visibility on the delivery order menu (/order/[slug])
-- available_guest:    controls visibility on the guest QR-code table menu (/guest/[tableId])

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS available_delivery BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_guest    BOOLEAN NOT NULL DEFAULT true;
