-- Add menu_item_id to order_items for inventory deduction
alter table public.order_items
  add column if not exists menu_item_id uuid references public.menu_items(id) on delete set null;

create index if not exists idx_order_items_menu_item_id on public.order_items(menu_item_id);
