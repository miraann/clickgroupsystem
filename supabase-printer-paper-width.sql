-- Add paper_width column to printers table
-- Stores the paper roll width in millimeters (e.g. 58, 80, 104)
-- Used to scale invoice print output to fit the printer's paper width

alter table public.printers
  add column if not exists paper_width integer default 80;

comment on column public.printers.paper_width is
  'Paper roll width in mm (48, 58, 72, 80, 104, 112). Used to scale invoice print layout.';
