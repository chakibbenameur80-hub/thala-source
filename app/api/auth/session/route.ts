import { NextResponse } from "next/server";
import { isAuthenticated, isUsingDefaultPassword } from "@/lib/auth";

/** `GET /api/auth/session` — used by the admin shell to confirm the cookie. */

export const dynamic = "force-dynamic";

export async function GET() {
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    usingDefaultPassword: isUsingDefaultPassword(),
    // Lets the admin banner tell the owner the exact env var to set.
    hint: "Définissez ADMIN_PASSWORD dans .env.local puis sur Vercel.",
  });
}
