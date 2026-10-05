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
--   Browser (public)  → NEXT_PUBLIC_SUPABASE_ANON_KEY   (read the catalogue only)
--   Server (admin)    → ADMIN_TOKEN                     (service_role, bypasses RLS)
--
-- Every write goes through a Next.js Route Handler that checks the admin session
-- cookie *before* touching Supabase, and those handlers use ADMIN_TOKEN. The anon
-- key is therefore never used for a write and can stay public: RLS grants it
-- SELECT on `products` and `shipping_rates` and nothing else.
--
-- Reading the orders table also requires ADMIN_TOKEN, which is why the dashboard
-- fetches its data from `GET /api/shop` rather than querying PostgREST from the
-- browser — the orders table is invisible to the public key by design.
--
--   ⚠  Never put ADMIN_TOKEN in a NEXT_PUBLIC_* variable. Next.js inlines those
--      into the browser bundle, which would publish your service-role key.
--      `lib/db/supabase.ts` carries `import "server-only"` to make that mistake
--      a build failure rather than a published credential.
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
-- Seed catalogue
-- =============================================================================
-- Without this the database is empty and the storefront shows nothing the moment
-- Supabase goes live, because the previous catalogue only ever existed in each
-- visitor's `localStorage`.
--
-- `on conflict do nothing` on the primary key makes this safe to re-run and safe
-- to run against a catalogue that has already been edited: existing rows are never
-- touched. This is the same guarantee the admin's "Importer le catalogue local"
-- button gives, applied here for a fresh install.
--
-- The two extra dresses reuse the seed photos on purpose, exactly as `lib/seed.ts`
-- does — replace them with real product shots from `/admin/products`. Note that the
-- first and third rows share `/images/dress-1.jpg`, which is why image deletion
-- checks the catalogue for other references before removing an object.

insert into public.products
  (id, title, subtitle, description, price, compare_at_price, images, sizes, featured, in_stock, created_at, updated_at)
values
  ('seed_robe_iferhounen', 'Robe Kablye Iferhounen', 'Brodé main — noir & or',
   'Robe kabyle traditionnelle en velours noir, brodée à la main aux fils dorés.'
   || E'\nTaille cintrée, jupe ample, doublure intérieure douce. Parfaite pour les fêtes et les cérémonies.'
   || E'\nFabriquée sur commande dans notre atelier de Tizi Ouzou.',
   12500, 15000, '["/images/dress-1.jpg"]', '["S","M","L","XL","CUSTOM"]', true, true,
   '2026-01-05T09:00:00Z', '2026-01-05T09:00:00Z'),

  ('seed_robe_atlas', 'Robe Kablye Atlas', 'Tissus Amazigh — rouge & bronze',
   'Robe kabyle moderne en tissues amazighs, coupe droite et manches longues.'
   || E'\nTissu résistant, motifs géométriques traditionnels brodés au fil de bronze.'
   || E'\nIdéale au quotidien comme pour une sortie habillée.',
   9800, null, '["/images/dress-2.jpg"]', '["S","M","L","XL"]', true, true,
   '2026-01-05T09:00:00Z', '2026-01-05T09:00:00Z'),

  ('seed_robe_djurdjura', 'Robe Djurdjura Perles', 'Blanc nacré — broderie fine',
   'Robe d''inspiration djurdjura, base crème et broderie nacrée sur le plastron.'
   || E'\nCoupe fluide, très confortable à porter au quotidien.'
   || E'\nTaille sur mesure disponible sur demande.',
   11500, 13500, '["/images/dress-1.jpg"]', '["M","L","XL","CUSTOM"]', false, true,
   '2026-01-05T09:00:00Z', '2026-01-05T09:00:00Z'),

  ('seed_robe_tizi', 'Robe Tizi Ouzou Broderie', 'Vert profond — fil d''argent',
   'Robe longue en velours vert avec broderie au fil d''argent, signée de notre atelier.'
   || E'\nIdéale pour le mariage et les fêtes de l''Aïd.'
   || E'\nLivraison partout en Algérie, paiement à la livraison.',
   16900, null, '["/images/dress-2.jpg"]', '["S","M","L","XL","CUSTOM"]', false, true,
   '2026-01-05T09:00:00Z', '2026-01-05T09:00:00Z')
on conflict (id) do nothing;


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- The rule, stated as simply as possible: the anon key may READ the catalogue and
-- the shipping rates. Nothing else. Every write — products, orders, shipping
-- rates, and every Storage object — requires the service-role key, which bypasses
-- RLS, and that key only ever exists inside a Route Handler guarded by the admin
-- session cookie.
--
-- Why the public key cannot insert orders
-- -----------------------------------------
-- An earlier version of this file granted `anon` an INSERT policy on `orders`, on
-- the reasoning that "a visitor must be able to place an order". It does not need
-- it. Order placement goes through `POST /api/orders`, which validates the payload
-- and **recomputes every price server-side** before inserting with the service-role
-- key. The anon INSERT policy was therefore pure attack surface: with nothing but
-- the public key, anyone could POST directly to PostgREST and write fabricated
-- orders with an arbitrary `total`, poisoning the dashboard and the revenue
-- figures. It has been removed.
--
-- The `authenticated` write policies are gone for the same reason. The app has no
-- Supabase Auth — admin identity is an httpOnly cookie checked in a Route Handler —
-- so no browser ever holds the `authenticated` role and those policies granted
-- nothing. But if anyone later enables Supabase Auth on this project (magic link,
-- a customer login), every signed-in visitor would instantly inherit full write
-- access to the catalogue, the rate table and the order history. `service_role`
-- needs none of them.

alter table public.products       enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.orders         enable row level security;

-- Dropped first so this script can be re-run, and so that re-running it *tightens*
-- an installation that was created from an older, looser version of this file.
drop policy if exists products_select_public     on public.products;
drop policy if exists products_admin_update      on public.products;
drop policy if exists products_admin_delete      on public.products;
drop policy if exists products_admin_insert      on public.products;
drop policy if exists shipping_select_public     on public.shipping_rates;
drop policy if exists shipping_admin_update      on public.shipping_rates;
drop policy if exists shipping_admin_insert      on public.shipping_rates;
drop policy if exists shipping_admin_delete      on public.shipping_rates;
drop policy if exists orders_insert_public       on public.orders;
drop policy if exists orders_admin_update        on public.orders;
drop policy if exists orders_admin_delete        on public.orders;
drop policy if exists orders_admin_read          on public.orders;
drop policy if exists orders_update_public       on public.orders;
drop policy if exists orders_delete_public       on public.orders;

-- Public catalogue -----------------------------------------------------------
-- Read-only, and the only thing the public key can do in Postgres.
create policy products_select_public
  on public.products for select
  to anon, authenticated
  using (true);

create policy shipping_select_public
  on public.shipping_rates for select
  to anon, authenticated
  using (true);

-- The orders table intentionally has **no** policy for `anon` or `authenticated`.
-- With RLS enabled and no matching policy, every statement against it returns
-- zero rows and every write is rejected — which is exactly what is wanted:
-- a visitor can place an order (through the Route Handler that recomputes the
-- prices) and cannot read, forge or delete anyone else's.

-- Orders are read by `service_role` only. Expressed as a policy rather than left
-- implicit so the intent is readable here rather than inferred from its absence.
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
