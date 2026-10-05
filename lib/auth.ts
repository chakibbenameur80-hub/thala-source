import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Admin authentication.
 *
 * Design goals, in order:
 *   1. The password must never be embedded in the client bundle, so the check
 *      happens in a Route Handler against `process.env.ADMIN_PASSWORD`.
 *   2. The session must not be readable by JavaScript, so it is an httpOnly
 *      cookie (an `XSS` payload cannot exfiltrate it).
 *   3. The session must be tamper-proof, so it carries an HMAC-SHA256 signature
 *      verified with a constant-time comparison.
 *   4. `/admin/*` must be blocked *before* rendering — hence the root `proxy.ts`.
 *
 * Note: `proxy.ts` and the API routes both call `verifySessionToken`, so the
 * cookie format is defined exactly once, here.
 */

export const SESSION_COOKIE = "thala_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

/**
 * Development fallback, used only when `ADMIN_PASSWORD` is unset.
 *
 * In production this is a hard failure rather than a warning: the value is in this
 * public repository, so a deployment that lost its `ADMIN_PASSWORD` would
 * otherwise be guarded by a credential every visitor can read. Failing loudly is
 * the better outcome — the fix is one variable in the Vercel dashboard, whereas
 * quietly accepting a published password means the catalogue, the orders and the
 * shipping rates are all one `curl` away.
 */
const DEFAULT_PASSWORD = "thala2026";

type SessionPayload = {
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Random id, so revoking is possible later by rotating the secret. */
  jti: string;
};

function getSecret(): string {
  // AUTH_SECRET is dedicated to signing; falling back to ADMIN_PASSWORD keeps
  // the setup to a single variable for most shops.
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

/** True when the shop is still running on the hard-coded development password. */
export function isUsingDefaultPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

/** Creates the signed session token returned to the client as a cookie. */
export function createSessionToken(): string {
  const payload: SessionPayload = {
    iat: Math.floor(Date.now() / 1000),
    jti: Math.random().toString(36).slice(2, 12),
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verifies a token's signature and age.
 * Returns `null` for anything that is not a currently-valid session.
 */
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(body);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length check first: `timingSafeEqual` throws on mismatched lengths.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.iat !== "number") return null;
    if (Date.now() / 1000 - payload.iat > SESSION_TTL_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Cookie attributes shared by the login (set) and logout (clear) handlers. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Reads the session from the incoming request cookies (server components, actions). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** True when the current request is an authenticated admin. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

/**
 * Constant-time password check.
 *
 * A plain `===` leaks how many leading characters matched through timing, which
 * is enough to brute-force a short password. Hashing both sides first makes the
 * comparison operate on equal-length digests regardless of the input.
 */
export function passwordMatches(candidate: string): boolean {
  // Compare unconditionally, then discard the result: a production deployment
  // with no `ADMIN_PASSWORD` must fail *after* a full comparison rather than
  // returning early on a length check, which would leak the shape of the input.
  const a = createHmac("sha256", "thala-password-compare").update(candidate).digest();
  const b = createHmac("sha256", "thala-password-compare").update(adminPassword()).digest();
  const matches = a.length === b.length && timingSafeEqual(a, b);
  return matches && !isDefaultPasswordRejected();
}

/**
 * True in production when `ADMIN_PASSWORD` is missing.
 *
 * Blocks login entirely rather than falling back to the repository's published
 * password. See {@link DEFAULT_PASSWORD}.
 */
function isDefaultPasswordRejected(): boolean {
  return process.env.NODE_ENV === "production" && isUsingDefaultPassword();
}
