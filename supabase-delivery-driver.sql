-- Add driver assignment fields to delivery_orders
ALTER TABLE delivery_orders
  ADD COLUMN IF NOT EXISTS driver_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_name text;
