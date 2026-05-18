-- Add status column to tables for needs-cleaning tracking
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'dirty'));
