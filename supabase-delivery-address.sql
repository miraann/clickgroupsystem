-- Add address_text column to delivery_orders table
-- This stores the human-readable address from Nominatim reverse geocoding

ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS address_text TEXT;
