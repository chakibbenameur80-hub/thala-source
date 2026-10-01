import { NextResponse } from "next/server";
import {
  createSessionToken,
  isUsingDefaultPassword,
  passwordMatches,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";

/**
 * `POST /api/auth/login` — exchanges the admin password for a signed session
 * cookie. The password is only ever read from the server environment.
 */

// Next.js 16: this route is always dynamic (it reads the request body and
// cookies), and it must never be cached at the edge.
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * In-memory throttle.
 *
 * A Map (not a DB) is the right trade-off here: on Vercel each serverless
 * instance is short-lived, so this reliably throttles bursts of guesses against
 * the same warm instance. A shared store (Upstash) would be needed for a
 * distributed, strictly-enforced limit.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip") || "unknown";
}

function isThrottled(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export async function POST(request: Request) {
  const key = clientKey(request);
  if (isThrottled(key)) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: "Mot de passe requis." }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    recordFailure(key);
    // Same message and status for "wrong password" and "unknown user": we do not
    // leak whether the account exists.
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  attempts.delete(key);

  const response = NextResponse.json({
    ok: true,
    // Surfaced so the login screen can warn the owner that the default password
    // is still in use.
    usingDefaultPassword: isUsingDefaultPassword(),
  });

  response.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  return response;
}
