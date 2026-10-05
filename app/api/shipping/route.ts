import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import { isSupabaseConfigured, SupabaseStoreDriver } from "@/lib/db/supabase";
import { defaultShippingRates } from "@/lib/shipping";
import type { ShippingRate } from "@/lib/types";

/** `GET /api/shipping` â€” public: wilaya rates. */
export const dynamic = "force-dynamic";

export async function GET() {
  // Local mode: the rates live in the browser's `localStorage`, so the server can
  // only offer the defaults. The storefront never calls this endpoint (it reads
  // its own store), but the defaults are the correct answer for a cold client.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ shipping: defaultShippingRates(), source: "defaults" });
  }
  try {
    const { shipping } = await new SupabaseStoreDriver().readPublic();
    return NextResponse.json({ shipping, source: "supabase" });
  } catch (error) {
    return serverError("lecture tarifs", error);
  }
}

/** `PUT /api/shipping` â€” admin: replace rates. */
export async function PUT(request: Request) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requأھte invalide." }, { status: 400 });
  }

  const rates = Array.isArray(body) ? body : (body as { rates?: unknown })?.rates;
  if (!Array.isArray(rates)) {
    return NextResponse.json({ error: "Tarifs invalides." }, { status: 422 });
  }

  // Coerce every field: the request is untrusted, so a malformed entry must be
  // rejected here rather than reaching the database as `NaN`.
  const parsed: ShippingRate[] = [];
  for (const entry of rates as Array<Record<string, unknown>>) {
    const wilayaCode = Number(entry?.wilayaCode);
    const home = Number(entry?.home);
    const office = Number(entry?.office);
    if (!Number.isInteger(wilayaCode) || wilayaCode < 1 || wilayaCode > 58) {
      return NextResponse.json({ error: `Code de wilaya invalide : ${entry?.wilayaCode}` }, { status: 422 });
    }
    if (!Number.isFinite(home) || home < 0 || !Number.isFinite(office) || office < 0) {
      return NextResponse.json({ error: `Tarif invalide pour la wilaya ${wilayaCode}.` }, { status: 422 });
    }
    parsed.push({ wilayaCode, home: Math.round(home), office: Math.round(office) });
  }

  try {
    await new SupabaseStoreDriver().putShipping(parsed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("maj tarifs", error);
  }
}
