import { NextResponse } from "next/server";
import { denyIfLocalMode, denyUnauthenticated, serverError } from "@/lib/api";
import { isValidOrderStatus } from "@/lib/validation";
import { SupabaseStoreDriver } from "@/lib/db/supabase";

/**
 * `PATCH  /api/orders/[id]` — change an order status.
 * `DELETE /api/orders/[id]` — remove an order.
 *
 * Admin-only, and only meaningful once Supabase is configured (in local mode the
 * dashboard mutates `localStorage` directly).
 */

// Next.js 16: `params` is a Promise and must be awaited.
type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  let status: unknown;
  try {
    const body = (await request.json()) as { status?: unknown };
    status = body.status;
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!isValidOrderStatus(status)) {
    return NextResponse.json({ error: "Statut invalide." }, { status: 422 });
  }

  try {
    const { id } = await context.params;
    await new SupabaseStoreDriver().updateOrderStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("maj statut commande", error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await denyUnauthenticated() ?? denyIfLocalMode();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    await new SupabaseStoreDriver().deleteOrder(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("suppression commande", error);
  }
}
