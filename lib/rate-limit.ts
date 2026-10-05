/**
 * Sliding-window rate limiter for public write endpoints.
 *
 * ## Why timestamps and not a counter
 *
 * The obvious implementation — keep a count per key, refuse past the limit — does
 * not actually express "N per minute". A counter only ever increases, so the
 * sixth request would lock that client out for the lifetime of the process, and
 * any "retry in a minute" message would be a lie. Keeping the hit timestamps lets
 * the window genuinely close: capacity comes back as old hits age out.
 *
 * ## Why the `now` parameter
 *
 * The limiter is exported as a factory so a test can drive an explicit clock. A
 * window that can only be exercised by sleeping 60 seconds is a window that goes
 * untested, and this one had a permanent-lockout bug precisely because of that.
 */
export type RateLimitDecision =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

export type RateLimiter = {
  /** Records a hit. Returns `limited: false` when the request may proceed. */
  hit(key: string): RateLimitDecision;
  /** Live key count, exposed so the cleanup path can be asserted on. */
  size(): number;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  /** Keys held before a sweep for expired entries. */
  sweepAbove?: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs, sweepAbove = 500, now = Date.now } = options;
  const hits = new Map<string, number[]>();

  function hit(key: string): RateLimitDecision {
    const at = now();
    const window = (hits.get(key) ?? []).filter((seen) => at - seen < windowMs);

    if (window.length >= limit) {
      // The refused request is not recorded: the window stays full, and the wait
      // is until its oldest hit ages out. That also makes `Retry-After` exact.
      hits.set(key, window);
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((window[0] + windowMs - at) / 1000)),
      };
    }

    window.push(at);
    hits.set(key, window);

    // Opportunistic sweep, so distinct keys cannot accumulate without bound on a
    // long-lived instance. Triggering on size rather than on every call keeps this
    // off the hot path.
    if (hits.size > sweepAbove) {
      for (const [other, seen] of hits) {
        if (seen.length === 0 || at - seen[seen.length - 1] > windowMs) hits.delete(other);
      }
    }

    return { limited: false };
  }

  return { hit, size: () => hits.size };
}
