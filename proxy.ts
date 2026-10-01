import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Route protection for the admin area.
 *
 * In Next.js 16 the old `middleware.ts` convention is deprecated and replaced by
 * `proxy.ts` (the `proxy` runtime, on Node.js, and always on — it cannot be
 * configured off). This runs *before* any admin page renders, so an
 * unauthenticated visitor never receives dashboard HTML, only a redirect to the
 * login form.
 *
 * Two layers guard this area, and both are needed:
 *   - this proxy, which runs before rendering;
 *   - the `(dashboard)` layout, which re-checks on the server.
 *
 * The API routes verify the cookie themselves as well: `proxy` only covers
 * pages, and a defence that lives in one place is not a defence.
 */

const LOGIN_PATH = "/admin/login";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Never gate the login page itself.
  //
  // The `config.matcher` below already excludes it, but relying on a matcher
  // pattern alone to avoid an infinite redirect is fragile: if it ever matched,
  // `/admin/login` would redirect to `/admin/login` forever and nobody could ever
  // sign in. This explicit early return makes that failure mode impossible, and
  // is also what an authenticated admin needs to be able to reach the form again.
  if (url.pathname === LOGIN_PATH) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // Remember where the admin was heading so the login form can bounce them back.
  const target = `${url.pathname}${url.search}`;
  if (target !== LOGIN_PATH) {
    url.searchParams.set("next", target);
  }
  url.pathname = LOGIN_PATH;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything under /admin except the login page itself.
  matcher: ["/admin", "/admin/((?!login).*)"],
};