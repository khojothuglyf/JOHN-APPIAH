/* ============================================================
   MARKETPLACE SUPABASE SCHEMA
   Run once in the Supabase SQL Editor (Dashboard > SQL > New query).
   Safe to re-run: tables use IF NOT EXISTS and every policy/trigger
   is guarded with DROP ... IF EXISTS first.

   Covers the "storefront first" scope: auth (profiles), catalog
   (categories, products) and the signed-in cart + wishlist.
   ============================================================ */

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  role text not null default 'CUSTOMER'
    check (role in ('CUSTOMER', 'SELLER', 'ADMIN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id bigserial primary key,
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null check (price >= 0),
  old_price numeric(10, 2) check (old_price is null or old_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  sku text,
  image_url text not null default '',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  category_id bigint references public.categories(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.wishlist_items (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ---------- updated_at helper + triggers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute procedure public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

drop trigger if exists cart_items_set_updated_at on public.cart_items;
create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute procedure public.set_updated_at();

-- ---------- Auth triggers: auto profile + first-user-admin ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

/* The very first registered profile becomes the platform ADMIN. */
create or replace function public.assign_first_user_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.profiles) = 1 then
    update public.profiles set role = 'ADMIN' where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_first_admin on public.profiles;
create trigger on_profile_first_admin
  after insert on public.profiles
  for each row execute procedure public.assign_first_user_admin();

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlist_items enable row level security;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

/* Profiles: a user can read and update only their own row. */
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

/* Categories: everyone can read; only admins write. */
drop policy if exists categories_read_all on public.categories;
create policy categories_read_all on public.categories
  for select using (true);

drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

/* Products: everyone can read; only admins write (seller dashboard
   stays local for now). */
drop policy if exists products_read_all on public.products;
create policy products_read_all on public.products
  for select using (true);

drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products
  for all using (public.is_admin()) with check (public.is_admin());

/* Cart: each user manages only their own line items. */
drop policy if exists cart_items_owner_all on public.cart_items;
create policy cart_items_owner_all on public.cart_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* Wishlist: each user manages only their own entries. */
drop policy if exists wishlist_items_owner_all on public.wishlist_items;
create policy wishlist_items_owner_all on public.wishlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Seed data (catalog) ----------

insert into public.categories (id, name, description) values
  (1, 'Electronics', 'Audio, computing and smart gadgets.'),
  (2, 'Fashion', 'Clothing, footwear and accessories.'),
  (3, 'Home & Living', 'Furniture, decor and kitchen essentials.'),
  (4, 'Beauty & Health', 'Skincare, personal care and wellness.'),
  (5, 'Sports & Outdoors', 'Fitness and outdoor gear.'),
  (6, 'Toys & Games', 'Play, puzzles and creative fun.'),
  (7, 'Books', 'Fiction, non-fiction and more.')
on conflict (id) do update
  set name = excluded.name, description = excluded.description;

insert into public.products (name, description, price, old_price, stock, sku, image_url, status, category_id, seller_id) values
  ('Wireless Bluetooth Headphones', 'Over-ear wireless headphones with active noise cancellation and 30h battery life.', 49.99, 79.99, 42, 'SKU-HP-001', '', 'ACTIVE', 1, null),
  ('Premium Cotton T-Shirt', 'Soft, breathable 100% cotton tee in a regular fit.', 19.99, null, 150, 'SKU-TS-001', '', 'ACTIVE', 2, null),
  ('Ceramic Coffee Mug', 'Stoneware mug with a matte finish and a 350ml capacity.', 14.50, 18.00, 60, 'SKU-MG-001', '', 'ACTIVE', 3, null),
  ('Vitamin C Brightening Serum', '10% vitamin C face serum for a radiant, even complexion.', 24.99, null, 35, 'SKU-SR-001', '', 'ACTIVE', 4, null),
  ('Non-Slip Yoga Mat', '6mm extra-thick yoga mat with alignment lines and carry strap.', 29.99, null, 80, 'SKU-YM-001', '', 'INACTIVE', 5, null),
  ('Wooden Building Blocks', '50-piece natural wood stacking blocks for creative play.', 22.00, null, 20, 'SKU-BL-001', '', 'ACTIVE', 6, null)
on conflict (id) do nothing;
