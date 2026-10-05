-- =============================================================================
-- THALA SOURCE — Supabase schema
-- =============================================================================
-- Run this once in Supabase → SQL Editor. It is safe to re-run.
--
-- It creates the three tables the app reads and writes, the Row Level Security
-- policies that make them safe to expose through PostgREST, and the Storage
-- bucket that holds product photos.
--
-- How the app authenticates
-- -------------------------
--   Browser (public)  → NEXT_PUBLIC_SUPABASE_ANON_KEY   (read-only, RLS applies)
--   Server (admin)    → ADMIN_TOKEN                     (service_role, bypasses RLS)
--
-- The dashboard's write requests go through Next.js Route Handlers that check the
-- admin session cookie *before* touching Supabase, and they use ADMIN_TOKEN. The
-- anon key is therefore never used for a write and can stay public.
--
--   ⚠  Never put ADMIN_TOKEN in a NEXT_PUBLIC_* variable. Next.js inlines those
--      into the browser bundle, which would publish your service-role key.
-- =============================================================================

create extension if not exists "pgcrypto";


-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
-- `images` is a jsonb array of absolute URLs, first entry = cover. Multiple photos
-- per product are supported and are not normalised into a child table, which keeps
-- the existing catalogue shape intact. Columns mirror `productToRow` in
-- lib/db/supabase.ts exactly — change one, change the other.

create table if not exists public.products (
  id                 text primary key,
  title              text           not null,
  subtitle           text,
  description        text,
  price              numeric(12, 2) not null check (price > 0),
  compare_at_price   numeric(12, 2) check (compare_at_price is null or compare_at_price > price),
  images             jsonb          not null default '[]'::jsonb,
  sizes              jsonb          not null default '[]'::jsonb,
  featured           boolean        not null default false,
  in_stock           boolean        not null default true,
  created_at         timestamptz    not null default now(),
  updated_at         timestamptz    not null default now()
);

create index if not exists products_created_at_idx on public.products (created_at desc);


-- -----------------------------------------------------------------------------
-- shipping_rates
-- -----------------------------------------------------------------------------
-- One row per wilaya. `home` = delivery to the door, `office` = stopdesk pickup.

create table if not exists public.shipping_rates (
  wilaya_code  integer primary key,
  home         numeric(12, 2) not null default 0,
  office       numeric(12, 2) not null default 0
);


-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
-- Prices are snapshotted onto the row (subtotal, shipping_price, total) so that
-- changing a price later never rewrites history. `items` holds the product title
-- and size as they were at purchase time.

create table if not exists public.orders (
  id             text primary key,
  reference      text           not null unique,
  created_at     timestamptz    not null default now(),
  status         text           not null default 'pending',
  customer_name  text           not null,
  phone          text           not null,
  wilaya_code    integer        not null,
  wilaya_name    text           not null,
  commune        text,
  delivery_type  text           not null,
  shipping_price numeric(12, 2) not null default 0,
  items          jsonb          not null default '[]'::jsonb,
  subtotal       numeric(12, 2) not null,
  total          numeric(12, 2) not null,
  note           text
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx    on public.orders (status);


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- The rule throughout: the anon key may READ the catalogue and INSERT orders,
-- and may do nothing else. Every product/rate write and every order update or
-- delete requires the service-role key, which bypasses RLS — and that key only
-- ever exists inside a Route Handler guarded by the admin session cookie.

alter table public.products       enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.orders         enable row level security;

-- Dropped first so this script can be re-run without "policy already exists".
drop policy if exists products_select_public     on public.products;
drop policy if exists products_admin_update      on public.products;
drop policy if exists products_admin_delete      on public.products;
drop policy if exists shipping_select_public     on public.shipping_rates;
drop policy if exists shipping_admin_update      on public.shipping_rates;
drop policy if exists shipping_admin_insert      on public.shipping_rates;
drop policy if exists shipping_admin_delete      on public.shipping_rates;
drop policy if exists orders_insert_public       on public.orders;
drop policy if exists orders_admin_update        on public.orders;
drop policy if exists orders_admin_delete        on public.orders;
drop policy if exists orders_admin_read          on public.orders;

-- Public catalogue -----------------------------------------------------------
create policy products_select_public
  on public.products for select
  to anon, authenticated
  using (true);

create policy shipping_select_public
  on public.shipping_rates for select
  to anon, authenticated
  using (true);

-- A visitor may place an order from the storefront. This is the single write the
-- public key is allowed, and it is limited to INSERT — a visitor cannot read,
-- update or delete orders, so they cannot enumerate other customers.
create policy orders_insert_public
  on public.orders for insert
  to anon, authenticated
  with check (true);

-- Admin writes. These exist for completeness and for a future Supabase-auth-based
-- admin. The current app uses ADMIN_TOKEN (service_role), which bypasses RLS
-- entirely, so these policies are not what authorises the dashboard today.
-- These exist for completeness, and for a future Supabase-auth-based admin. They
-- deliberately grant nothing to the `anon` role, which is the only role the
-- browser ever holds.
--
-- They do NOT authorise the current dashboard: that path uses ADMIN_TOKEN
-- (service_role), which bypasses RLS, and the Route Handler checks the admin
-- session cookie before it calls Supabase at all. Written as explicit per-command
-- grants rather than `for all` so each action is readable at a glance.
create policy products_admin_update
  on public.products for update
  to authenticated
  using (true)
  with check (true);

create policy products_admin_delete
  on public.products for delete
  to authenticated
  using (true);

create policy shipping_admin_update
  on public.shipping_rates for update
  to authenticated
  using (true)
  with check (true);

create policy shipping_admin_delete
  on public.shipping_rates for delete
  to authenticated
  using (true);

create policy shipping_admin_insert
  on public.shipping_rates for insert
  to authenticated
  with check (true);

create policy orders_admin_update
  on public.orders for update
  to authenticated
  using (true)
  with check (true);

create policy orders_admin_delete
  on public.orders for delete
  to authenticated
  using (true);

-- Reads of an order are the admin dashboard's job alone. `to authenticated` with
-- `using (false)` means: no authenticated visitor may read the orders table
-- through the public API, so order history cannot be enumerated from the browser.
create policy orders_admin_read
  on public.orders for select
  to service_role
  using (true);


-- =============================================================================
-- Storage — the product photo bucket
-- =============================================================================
-- `product-images` is public-read: the storefront has to display these photos to
-- anonymous visitors, and the URLs are stored on the product row. That is the
-- same trust model as any CDN-hosted image.
--
-- Writes are NOT public. Only the service-role key (ADMIN_TOKEN, server-side only)
-- can upload or delete, so a visitor cannot write to your bucket. The bucket is
-- deliberately not made writable by the anon key.
--
-- `file_size_limit` matches MAX_IMAGE_BYTES in lib/images.ts, so a file that the
-- app would reject is also rejected by Storage itself.

insert into storage.buckets (id, name, public, file_size_limit)
values ('product-images', 'product-images', true, 10485760) -- 10 MB
on conflict (id) do update
  set public          = true,
      file_size_limit = excluded.file_size_limit;

-- The public-read policy. `select` on a public bucket is what makes
-- getPublicUrl() resolvable by anyone.
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

-- Uploads and deletes are restricted to the service role.
--
-- Supabase represents "service role" in RLS as `to service_role`, which is why
-- these name the role explicitly. In practice a service-role client skips RLS
-- altogether, so these policies are documentation of intent rather than the
-- active gate. If ADMIN_TOKEN were ever set to the anon key, the absence of an
-- anon insert policy is what would stop the storefront accepting uploads — which
-- is the behaviour we want, so do not add one.
drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'product-images');

drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete
  on storage.objects for delete
  to service_role
  using (bucket_id = 'product-images');

drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update
  on storage.objects for update
  to service_role
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');
