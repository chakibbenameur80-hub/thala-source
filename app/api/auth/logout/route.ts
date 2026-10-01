import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

/** `POST /api/auth/logout` — clears the admin session cookie. */

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // `maxAge: 0` is what actually removes it; the rest keeps the browser from
  // keeping a stale copy under a different attribute set.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
