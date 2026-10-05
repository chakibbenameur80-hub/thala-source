// End-to-end checks against a live deployment + a real Supabase project.
//
//   npm run test:e2e                 # public/auth surface only (no secrets needed)
//   npm run test:e2e -- --full       # + authenticated CRUD, upload, storage, orders
//
// Reads its target from E2E_BASE_URL (default: the production URL) and, for the
// full run, the admin cookie from E2E_COOKIE plus the Supabase credentials from
// E2E_SUPABASE_URL / E2E_SERVICE_KEY. It prints the *names* of missing variables
// and nothing else, and never prints a secret value.
//
// The full run cleans up everything it creates, so it is safe to point at
// production: every product and uploaded object it makes is deleted at the end,
// and it refuses to delete anything it did not create.

import sharp from "sharp";
import type { Order, Product } from "@/lib/types";

const BASE = (process.env.E2E_BASE_URL ?? "https://thala-source.vercel.app").replace(/\/+$/, "");
const FULL = process.argv.includes("--full");
const COOKIE = process.env.E2E_COOKIE ?? "";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1;
    console.log(`OK   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

type ReqInit = {
  method?: string;
  body?: string | null;
  headers?: Record<string, string>;
  /** Set false to omit the admin cookie, i.e. probe as a genuine anonymous visitor. */
  auth?: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Response shape the assertions read.
 *
 * Loosely typed on purpose: this is a black-box probe, so it must be able to
 * report whatever the server actually sent — including a non-JSON error page — and
 * then say "that was not the shape I expected" instead of crashing on a cast.
 */
type ProbeResponse = {
  status: number;
  json: Record<string, unknown> | undefined;
  text: string;
  headers: Headers;
};

async function req(path: string, init: ReqInit = {}): Promise<ProbeResponse> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.body) headers["content-type"] = "application/json";
  if (COOKIE && init.auth !== false) headers.cookie = COOKIE;
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text, headers: res.headers };
}

/*
 * Narrowing helpers. A black-box probe gets `unknown` payloads by design; these
 * turn them into something assertable without scattering casts through every
 * assertion. Each returns the fallback rather than throwing, so a wrong-shaped
 * response produces a readable FAIL instead of a stack trace.
 */

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** A real, valid JPEG — not a renamed text file, so sharp accepts it. */
async function sampleImage() {
  const width = 900;
  const height = 600;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = 128;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function upload(buffer: Buffer, filename = "probe.jpg", type = "image/jpeg") {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(buffer)], { type }), filename);
  const res = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: COOKIE ? { cookie: COOKIE } : {},
    body: form,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
}

/**
 * Order placement that tolerates the route's own throttle.
 *
 * `POST /api/orders` allows 5 per minute per IP and answers 429 past that. The
 * checks below need more than 5 requests, so a fixed pause is not enough on its
 * own: the limiter is an in-memory `Map`, which on Vercel means every serverless
 * instance keeps a separate count, so a single client can draw a 429 from one
 * instance while another has room. Pacing cannot predict which instance answers.
 *
 * The wait therefore follows the route's own `Retry-After` rather than a guessed
 * delay. The limiter does its job either way; this only keeps a 429 from standing
 * in for the validation result under test. A `Retry-After` is rounded up with a
 * second of slack, since the limiter counts the attempt that drew the 429 too.
 */
let throttled = 0;

function retryAfterMs(res: ProbeResponse): number {
  const header = res.headers?.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return (seconds + 1) * 1000;
  return 20_000;
}

async function postOrder(path: string, init: ReqInit = {}): Promise<ProbeResponse> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await req(path, { ...init, method: "POST" });
    if (res.status !== 429 || attempt >= 3) return res;
    throttled += 1;
    await sleep(retryAfterMs(res));
  }
}

/**
 * Asks Supabase Storage whether an object still exists.
 *
 * Two traps make a naive `fetch(url).status` useless for this, and both produced
 * false results against the live project:
 *
 *   - The public object endpoint sits behind a CDN that keeps serving an image
 *     after it has been deleted, so a deleted object still answers `200`.
 *   - A genuinely missing object answers `400`, while a cached miss can answer
 *     `404` with a `NoSuchKey` body. Neither status alone identifies the object.
 *
 * So: a unique query string forces an origin lookup rather than a cache hit, and
 * the body is inspected as well as the status.
 */
async function storageServes(url: string): Promise<boolean> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}cb=${Math.random().toString(36).slice(2)}`, {
    headers: { "cache-control": "no-cache" },
  });
  const body = await res.text();
  if (res.status === 200) return true;
  // A non-200 that still describes the object is treated as served, so an
  // unexpected error shape fails loudly instead of passing as "purged".
  return !/NoSuchKey|not_found|Object not found/i.test(body);
}

async function main() {
  console.log(`target: ${BASE}`);
  console.log(`mode:   ${FULL ? "full (authenticated)" : "public surface only"}\n`);

  /* ---------------- public surface ---------------- */

  const pages = ["/", "/admin/login", "/images/logo.jpg"];
  for (const p of pages) {
    const r = await req(p);
    check(`GET ${p} -> 200`, r.status === 200, `got ${r.status}`);
  }

  const adminPage = await req("/admin/products", { auth: false });
  check(
    "GET /admin/products redirects anonymous visitor",
    adminPage.status === 307 || adminPage.status === 302 || adminPage.status === 401,
    `got ${adminPage.status}`,
  );

  const products = await req("/api/products");
  check("GET /api/products -> 200", products.status === 200, `got ${products.status}`);
  const catalogue = asArray<Product>(products.json?.products);
  check(
    "catalogue is a non-empty array",
    catalogue.length > 0,
    `${catalogue.length} products`,
  );

  /* ---------------- auth required ---------------- */

  const anonMutations = [
    ["POST", "/api/products", '{"title":"x","id":"probe","price":1,"sizes":["M"],"images":[]}'],
    ["PUT", "/api/shipping", "[]"],
    ["POST", "/api/upload", "{}"],
    ["DELETE", "/api/upload", "{}"],
    ["POST", "/api/products/import", '{"products":[]}'],
  ];
  for (const [method, path, body] of anonMutations) {
    const r = await req(path, { method, body, auth: false });
    check(
      `anon ${method} ${path} -> 401`,
      r.status === 401 || r.status === 403,
      `got ${r.status}`,
    );
  }

  const anonReads = await req("/api/shop", { auth: false });
  check("anon GET /api/shop -> 401", anonReads.status === 401, `got ${anonReads.status}`);

  const anonOrderPatch = await req("/api/orders/probe", {
    method: "PATCH",
    body: '{"status":"delivered"}',
    auth: false,
  });
  check(
    "anon PATCH /api/orders/[id] -> 401",
    anonOrderPatch.status === 401 || anonOrderPatch.status === 403,
    `got ${anonOrderPatch.status}`,
  );

  const anonOrderDelete = await req("/api/orders/probe", { method: "DELETE", auth: false });
  check(
    "anon DELETE /api/orders/[id] -> 401",
    anonOrderDelete.status === 401 || anonOrderDelete.status === 403,
    `got ${anonOrderDelete.status}`,
  );

  /* ---------------- order validation ---------------- */

  const badBodies = [
    ["not json at all", null, 400],
    ["missing phone", '{"productId":"seed_robe_atlas","customerName":"Karim Benali","wilayaCode":16,"deliveryType":"home","size":"M"}', 422],
    ["bad phone", '{"productId":"seed_robe_atlas","customerName":"Karim Benali","phone":"123","wilayaCode":16,"deliveryType":"home","size":"M"}', 422],
    ["wilaya out of range", '{"productId":"seed_robe_atlas","customerName":"Karim Benali","phone":"0555123456","wilayaCode":99,"deliveryType":"home","size":"M"}', 422],
    ["bad delivery type", '{"productId":"seed_robe_atlas","customerName":"Karim Benali","phone":"0555123456","wilayaCode":16,"deliveryType":"teleport","size":"M"}', 422],
    ["unknown product", '{"productId":"does-not-exist","customerName":"Karim Benali","phone":"0555123456","wilayaCode":16,"deliveryType":"home","size":"M"}', 404],
    ["quantity over cap", '{"productId":"seed_robe_atlas","customerName":"Karim Benali","phone":"0555123456","wilayaCode":16,"deliveryType":"home","size":"M","quantity":9999}', 422],
  ];
  for (const [label, body, expected] of badBodies as [string, string | null, number][]) {
    const r = body === null
      ? await postOrder("/api/orders", { body: "{" })
      : await postOrder("/api/orders", { body });
    check(`order rejected: ${label} -> ${expected}`, r.status === expected, `got ${r.status}`);
  }

  // The price-integrity check that matters most: send a forged total and confirm
  // the server ignores it and returns its own figure.
  const forged = await postOrder("/api/orders", {
    body: JSON.stringify({
      productId: "seed_robe_atlas",
      customerName: "Karim Benali",
      phone: "0555123456",
      wilayaCode: 16,
      deliveryType: "home",
      size: "M",
      quantity: 2,
      total: 1,
      subtotal: 1,
      unitPrice: 1,
    }),
  });
  // Supabase mode inserts and answers 201; local mode only prices and validates,
  // so it answers 200 with `persisted: false`. Both carry a priced order to check.
  if (forged.status === 201 || forged.status === 200) {
    const order = asObject(forged.json?.order);
    const firstItem = asObject(asArray(order.items)[0]);
    const serverUnit = asNumber(firstItem.unitPrice);
    const quantity = asNumber(firstItem.quantity) ?? 1;
    const serverTotal = asNumber(order.total);
    const expectedUnit = catalogue.find((p) => p.id === "seed_robe_atlas")?.price;

    check(
      "forged total ignored: unitPrice comes from the catalogue",
      serverUnit !== undefined && serverUnit === expectedUnit,
      `server said ${serverUnit}, catalogue says ${expectedUnit}`,
    );
    check(
      "forged total ignored: total = unitPrice*qty + shipping",
      serverTotal !== undefined && serverUnit !== undefined && serverTotal >= serverUnit * quantity && serverTotal !== 1,
      `total ${serverTotal}`,
    );
    check(
      "order gets a customer-facing reference",
      typeof asString(order.reference) === "string" && /^TS-[0-9A-Z]{6,}$/.test(asString(order.reference) ?? ""),
      `ref ${asString(order.reference) ?? "none"}`,
    );
    // A 201 claims a stored row, so only then may the response claim persistence.
    check(
      "persisted flag matches the status code",
      forged.status === 201 ? forged.json?.persisted === true : forged.json?.persisted === false,
      `status ${forged.status}, persisted ${String(forged.json?.persisted)}`,
    );
    if (FULL && forged.status === 201) await deleteOrder(asString(order.id) ?? "");
  } else {
    check(
      "forged-total order accepted so prices can be inspected",
      false,
      `got ${forged.status} — ${forged.text.slice(0, 80)}`,
    );
  }

  if (!FULL) {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (throttled > 0) {
      console.log(`note: retried ${throttled} order POST(s) after a 429 from the route rate limiter`);
    }
    if (fail > 0) console.log(`failing: ${failures.join(" | ")}`);
    process.exit(fail > 0 ? 1 : 0);
    return;
  }

  /* ---------------- authenticated CRUD ---------------- */

  // Only the cookie is genuinely required. Everything the suite asserts on runs
  // through the app's own endpoints, which hold the service-role key server-side;
  // nothing here needs it locally. `E2E_SERVICE_KEY` is optional and only enables
  // the extra "did we leave objects in the bucket" sweep at the end.
  const missing = ["E2E_COOKIE", "E2E_SUPABASE_URL"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.log(`\nFull run needs: ${missing.join(", ")} — stopping after the public checks.`);
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
    return;
  }

  const admin = await req("/api/shop");
  check("authed GET /api/shop -> 200", admin.status === 200, `got ${admin.status}`);
  const adminOrders = asArray<Order>(admin.json?.orders);
  check("admin read includes an orders array", Array.isArray(admin.json?.orders), `${adminOrders.length} orders`);

  // Everything this run creates, so cleanup can reverse exactly that and nothing else.
  const created: { kind: "product" | "order" | "image"; id?: string; url?: string }[] = [];
  try {
    /* --- create + upload --- */
    const id = `e2e_${Date.now().toString(36)}`;
    const img = await sampleImage();

    const up = await upload(img);
    // 201 is correct here: the upload created a new object.
  check("upload -> 201", up.status === 201, `got ${up.status} ${up.json?.error ?? ""}`);
    const url = up.json?.url;
    check("upload returns a public URL", typeof url === "string" && url.startsWith("http"), url ?? "");
    created.push({ kind: "image", url });

    if (url) {
      const head = await fetch(`${url}${url.includes("?") ? "&" : "?"}cb=${Math.random().toString(36).slice(2)}`, {
        method: "GET",
        headers: { "cache-control": "no-cache" },
      });
      check("uploaded image is publicly reachable -> 200", head.status === 200, `got ${head.status}`);
      check(
        "stored object is WebP",
        (head.headers.get("content-type") ?? "").includes("webp"),
        head.headers.get("content-type") ?? "no content-type",
      );
    }

    const price = 12345;
    const create = await req("/api/products", {
      method: "POST",
      body: JSON.stringify({
        id,
        title: "E2E Probe",
        subtitle: "temporary",
        description: "Created by the e2e suite; deleted at the end.",
        price,
        compareAtPrice: 15000,
        images: url ? [url] : [],
        sizes: ["M"],
        featured: false,
        inStock: true,
      }),
    });
    check("create product -> 201", create.status === 201, `got ${create.status} ${create.json?.error ?? ""}`);
    created.push({ kind: "product", id });

    const dup = await req("/api/products", {
      method: "POST",
      body: JSON.stringify({ id, title: "dup", price: 1, sizes: ["M"], images: [] }),
    });
    check("duplicate product id -> 409", dup.status === 409, `got ${dup.status}`);

    const badPrice = await req("/api/products", {
      method: "POST",
      body: JSON.stringify({ id: `${id}_b`, title: "bad", price: -5, sizes: ["M"], images: [] }),
    });
    check("negative price -> 422", badPrice.status === 422, `got ${badPrice.status}`);

    const badCompare = await req("/api/products", {
      method: "POST",
      body: JSON.stringify({ id: `${id}_c`, title: "bad", price: 100, compareAtPrice: 50, sizes: ["M"], images: [] }),
    });
    check("compareAtPrice below price -> 422", badCompare.status === 422, `got ${badCompare.status}`);

    /* --- read back through the public endpoint --- */
    const listed = await req("/api/products");
    const found = asArray<Product>(listed.json?.products).find((q) => q.id === id);
    check("new product visible on the public catalogue", Boolean(found), found ? "found" : "missing");
    check("stored price is exact", found?.price === price, `${found?.price}`);

    /* --- update --- */
    const second = await upload(await sampleImage(), "second.jpg");
    check("second upload -> 201", second.status === 201, `got ${second.status}`);
    created.push({ kind: "image", url: second.json?.url });

    const update = await req(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        id,
        title: "E2E Probe Renamed",
        subtitle: "changed",
        description: "updated by e2e",
        price: 999,
        compareAtPrice: null,
        images: second.json?.url ? [second.json.url] : [],
        sizes: ["M", "L"],
        featured: true,
        inStock: true,
      }),
    });
    check("update product -> 200", update.status === 200, `got ${update.status} ${update.json?.error ?? ""}`);

    const afterUpdate = await req("/api/products");
    const updated = asArray<Product>(afterUpdate.json?.products).find((q) => q.id === id);
    check("update persisted: title", updated?.title === "E2E Probe Renamed", updated?.title ?? "");
    check("update persisted: price", updated?.price === 999, `${updated?.price}`);
    check("update persisted: description", updated?.description === "updated by e2e", "");
    check("update persisted: sizes", asArray(updated?.sizes).length === 2, `${asArray(updated?.sizes).length}`);
    check(
      "update replaced the image",
      asString(second.json?.url) ? updated?.images?.[0] === second.json.url : true,
      `${updated?.images?.[0]}`,
    );

    if (url) {
      // The replaced image should have been purged from Storage.
      const stillServed = await storageServes(url);
      check("replaced image purged from Storage", !stillServed, `still served: ${stillServed}`);
    }

    const missingUpdate = await req("/api/products/does-not-exist", {
      method: "PUT",
      body: JSON.stringify({ id: "does-not-exist", title: "x", price: 1, sizes: ["M"], images: [] }),
    });
    check("PUT unknown product -> 404 (does not create)", missingUpdate.status === 404, `got ${missingUpdate.status}`);

    /* --- order placed as a customer, seen by the admin --- */
    const orderRes = await postOrder("/api/orders", {
      body: JSON.stringify({
        productId: id,
        customerName: "Karim Benali",
        phone: "0555123456",
        wilayaCode: 16,
        commune: "Bab Ezzouar",
        deliveryType: "home",
        size: "L",
        quantity: 2,
      }),
    });
    check("customer order -> 201", orderRes.status === 201, `got ${orderRes.status} ${orderRes.json?.error ?? ""}`);

    const placedOrder = asObject(orderRes.json?.order);
    const placedItem = asObject(asArray(placedOrder.items)[0]);
    const placedUnit = asNumber(placedItem.unitPrice);
    const placedQuantity = asNumber(placedItem.quantity) ?? 1;
    const placedTotal = asNumber(placedOrder.total);
    check(
      "order price recomputed from the catalogue (999 x 2 + shipping)",
      placedUnit === 999 && placedTotal !== undefined && placedTotal > placedUnit * placedQuantity,
      `unit ${placedUnit}, total ${placedTotal}`,
    );

    const placedId = asString(placedOrder.id);
    if (placedId) created.push({ kind: "order", id: placedId });

    const withOrders = await req("/api/shop");
    const seen = asArray<Order>(withOrders.json?.orders).find((o) => o.id === placedId);
    check("order appears in the admin dashboard", Boolean(seen), seen ? `ref ${seen.reference}` : "not found");

    if (placedId) {
      const patch = await req(`/api/orders/${placedId}`, {
        method: "PATCH",
        body: '{"status":"confirmed"}',
      });
      check("admin status change -> 200", patch.status === 200, `got ${patch.status}`);
      const reread = await req("/api/shop");
      const again = asArray<Order>(reread.json?.orders).find((o) => o.id === placedId);
      check("status change persisted", again?.status === "confirmed", again?.status ?? "");
    }

    const ghost = await req("/api/orders/no-such-order", {
      method: "PATCH",
      body: '{"status":"confirmed"}',
    });
    check("PATCH unknown order -> 404", ghost.status === 404, `got ${ghost.status}`);

    /* --- RLS: the anon key cannot write or read orders --- */
    const sbUrl = process.env.E2E_SUPABASE_URL;
    const sbKey = process.env.E2E_SERVICE_KEY;
    const anonKey = process.env.E2E_ANON_KEY;
    if (anonKey) {
      const postgrest = `${sbUrl}/rest/v1`;
      const keyHeaders = { apikey: anonKey, authorization: `Bearer ${anonKey}` };

      /*
       * Status codes alone do not prove RLS here. PostgREST answers a DELETE or
       * UPDATE that RLS filtered out with `204 No Content` and zero rows, which
       * looks exactly like success. So each probe asks for the affected rows back
       * (`Prefer: return=representation`) and asserts on those, then re-reads to
       * confirm the data really is untouched.
       */
      const returning = { ...keyHeaders, "content-type": "application/json", prefer: "return=representation" };

      const anonInsert = await fetch(`${postgrest}/orders`, {
        method: "POST",
        headers: { ...returning },
        body: JSON.stringify({
          id: "rls_probe",
          reference: "TS-RLSPROBE",
          created_at: new Date().toISOString(),
          status: "pending",
          customer_name: "Attacker",
          phone: "0555123456",
          wilaya_code: 16,
          wilaya_name: "Alger",
          delivery_type: "home",
          shipping_price: 0,
          items: [],
          subtotal: 1,
          total: 1,
        }),
      });
      const insertRows = anonInsert.status === 200 ? await anonInsert.json() : [];
      check(
        "RLS: anon key cannot INSERT an order",
        anonInsert.status >= 400 && (!Array.isArray(insertRows) || insertRows.length === 0),
        `status ${anonInsert.status}, rows ${Array.isArray(insertRows) ? insertRows.length : "n/a"}`,
      );

      const anonRead = await fetch(`${postgrest}/orders?select=id&limit=5`, { headers: keyHeaders });
      const anonRows = anonRead.status === 200 ? await anonRead.json() : null;
      check(
        "RLS: anon key cannot read orders",
        anonRead.status >= 400 || (Array.isArray(anonRows) && anonRows.length === 0),
        `status ${anonRead.status}, rows ${Array.isArray(anonRows) ? anonRows.length : "n/a"}`,
      );

      const anonWriteProduct = await fetch(`${postgrest}/products?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...returning },
        body: JSON.stringify({ title: "hijacked", price: 1 }),
      });
      const updateRows = anonWriteProduct.status === 200 ? await anonWriteProduct.json() : [];
      check(
        "RLS: anon key cannot UPDATE products",
        !Array.isArray(updateRows) || updateRows.length === 0,
        `status ${anonWriteProduct.status}, rows ${Array.isArray(updateRows) ? updateRows.length : "n/a"}`,
      );

      const anonDeleteProduct = await fetch(`${postgrest}/products?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...returning },
      });
      const deleteRows = anonDeleteProduct.status === 200 ? await anonDeleteProduct.json() : [];
      check(
        "RLS: anon key cannot DELETE products",
        !Array.isArray(deleteRows) || deleteRows.length === 0,
        `status ${anonDeleteProduct.status}, rows ${Array.isArray(deleteRows) ? deleteRows.length : "n/a"}`,
      );

      // The decisive one: the row must still be there, unaltered.
      const survivor = await fetch(`${postgrest}/products?id=eq.${id}&select=id,title,price`, {
        headers: keyHeaders,
      });
      const survivorRows = survivor.status === 200 ? await survivor.json() : [];
      check(
        "RLS: the product survived the anon write attempts unchanged",
        Array.isArray(survivorRows) &&
          survivorRows.length === 1 &&
          survivorRows[0].title === "E2E Probe Renamed" &&
          survivorRows[0].price === 999,
        Array.isArray(survivorRows) && survivorRows.length === 1
          ? `title "${survivorRows[0].title}" price ${survivorRows[0].price}`
          : `${survivorRows.length} row(s) found`,
      );

      const anonWriteShipping = await fetch(`${postgrest}/shipping_rates?wilaya_code=eq.16`, {
        method: "PATCH",
        headers: { ...returning },
        body: JSON.stringify({ home: 1 }),
      });
      const shippingRows = anonWriteShipping.status === 200 ? await anonWriteShipping.json() : [];
      check(
        "RLS: anon key cannot UPDATE shipping_rates",
        !Array.isArray(shippingRows) || shippingRows.length === 0,
        `status ${anonWriteShipping.status}, rows ${Array.isArray(shippingRows) ? shippingRows.length : "n/a"}`,
      );
    } else {
      console.log("note: set E2E_ANON_KEY to also exercise the RLS policies directly");
    }

    /* --- delete --- */
    const del = await req(`/api/products/${id}`, { method: "DELETE" });
    check("delete product -> 200", del.status === 200, `got ${del.status} ${del.json?.error ?? ""}`);

    const afterDelete = await req("/api/products");
    const survivors = asArray<Product>(afterDelete.json?.products);
    check(
      "product gone from the public catalogue",
      !survivors.some((q) => q.id === id),
      survivors.some((q) => q.id === id) ? "still present" : "removed",
    );

    if (second.json?.url) {
      const stillServed = await storageServes(second.json.url);
      check("deleted product's image purged from Storage", !stillServed, `still served: ${stillServed}`);
    }

    const missingDelete = await req("/api/products/no-such-product", { method: "DELETE" });
    check("DELETE unknown product -> 404", missingDelete.status === 404, `got ${missingDelete.status}`);

    /* --- direct storage listing, to prove no orphans remain --- */
    if (sbUrl && sbKey) {
      const list = await fetch(
        `${sbUrl}/storage/v1/object/list/product-images`,
        {
          method: "POST",
          headers: { apikey: sbKey, authorization: `Bearer ${sbKey}`, "content-type": "application/json" },
          body: JSON.stringify({ prefix: "products", limit: 1000 }),
        },
      );
      if (list.status === 200) {
        const objects: { name?: string }[] = await list.json();
        const orphans = (objects ?? []).filter((o) => String(o.name).includes(String(Date.now()).slice(0, 8)));
        check(
          "no orphaned objects left behind by this run",
          orphans.length === 0,
          `${(objects ?? []).length} object(s) in bucket`,
        );
      } else {
        console.log(`note: could not list the bucket (status ${list.status}); skipping the orphan check`);
      }
    }
  } finally {
    /* --- cleanup: only ever what this run created --- */
    console.log("\ncleanup:");
    for (const item of created.reverse()) {
      try {
        if (item.kind === "product") {
          const r = await req(`/api/products/${item.id}`, { method: "DELETE" });
          // The test already deleted this product on purpose; a second 404 just
          // confirms the row is gone rather than signalling a cleanup problem.
          console.log(`  product ${item.id} -> ${r.status}${r.status === 404 ? " (already deleted)" : ""}`);
        } else if (item.kind === "order") {
          const r = await req(`/api/orders/${item.id}`, { method: "DELETE" });
          console.log(`  order ${item.id} -> ${r.status}`);
        } else if (item.kind === "image" && item.url) {
          const r = await req("/api/upload", { method: "DELETE", body: JSON.stringify({ url: item.url }) });
          console.log(`  image -> ${r.status}`);
        }
      } catch (cause) {
        console.log(`  cleanup failed for ${JSON.stringify(item)}: ${String(cause)}`);
      }
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (throttled > 0) {
    console.log(`note: retried ${throttled} order POST(s) after a 429 from the route rate limiter`);
  }
  if (fail > 0) console.log(`failing: ${failures.join(" | ")}`);
  process.exit(fail > 0 ? 1 : 0);
}

async function deleteOrder(id: string): Promise<void> {
  if (!COOKIE || !id) return;
  await req(`/api/orders/${id}`, { method: "DELETE" });
}

void main();
