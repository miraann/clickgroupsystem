-- ClickGroup POS - Supabase Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'owner' check (role in ('seller', 'owner', 'manager', 'cashier', 'waiter', 'chef')),
  restaurant_id uuid,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- RESTAURANTS TABLE (multi-tenant core)
-- ============================================================
create table public.restaurants (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'trial' check (status in ('active', 'suspended', 'trial', 'expired')),
  plan text not null default 'starter' check (plan in ('starter', 'professional', 'enterprise')),
  address text,
  phone text,
  email text,
  logo_url text,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add FK from profiles to restaurants
alter table public.profiles
  add constraint profiles_restaurant_id_fkey
  foreign key (restaurant_id) references public.restaurants(id) on delete set null;

-- ============================================================
-- RESTAURANT USERS TABLE
-- ============================================================
create table public.restaurant_users (
  id uuid default uuid_generate_v4() primary key,
  restaurant_id uuid references public.restaurants(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'waiter' check (role in ('owner', 'manager', 'cashier', 'waiter', 'chef')),
  created_at timestamptz default now(),
  unique(restaurant_id, user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_users enable row level security;

-- PROFILES policies
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Sellers can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'seller'
    )
  );

create policy "Restaurant owners can view their staff profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.restaurant_users ru
      join public.profiles owner_profile on owner_profile.id = auth.uid()
      where ru.user_id = profiles.id
        and ru.restaurant_id = owner_profile.restaurant_id
    )
  );

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- RESTAURANTS policies
create policy "Sellers can view all restaurants"
  on public.restaurants for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'seller'
    )
  );

create policy "Restaurant members can view their restaurant"
  on public.restaurants for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and restaurant_id = restaurants.id
    )
  );

create policy "Sellers can insert restaurants"
  on public.restaurants for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'seller'
    )
  );

create policy "Sellers can update restaurants"
  on public.restaurants for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'seller'
    )
  );

create policy "Restaurant owners can update own restaurant"
  on public.restaurants for update
  using (owner_id = auth.uid());

-- RESTAURANT USERS policies
create policy "Sellers can view all restaurant users"
  on public.restaurant_users for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'seller'
    )
  );

create policy "Restaurant members can view their restaurant users"
  on public.restaurant_users for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and restaurant_id = restaurant_users.restaurant_id
    )
  );

create policy "Restaurant owners can manage their users"
  on public.restaurant_users for all
  using (
    exists (
      select 1 from public.restaurant_users ru
      join public.profiles p on p.id = auth.uid()
      where ru.restaurant_id = restaurant_users.restaurant_id
        and ru.user_id = auth.uid()
        and ru.role in ('owner', 'manager')
    )
  );

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'owner')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_profiles_restaurant_id on public.profiles(restaurant_id);
create index idx_profiles_role on public.profiles(role);
create index idx_restaurants_owner_id on public.restaurants(owner_id);
create index idx_restaurants_status on public.restaurants(status);
create index idx_restaurant_users_restaurant_id on public.restaurant_users(restaurant_id);
create index idx_restaurant_users_user_id on public.restaurant_users(user_id);
