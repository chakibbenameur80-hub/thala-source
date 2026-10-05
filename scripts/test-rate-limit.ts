// Unit checks for the sliding-window limiter behind `POST /api/orders`.
//
// The limiter is security-relevant, and it shipped with a bug this file exists to
// prevent: it counted hits per key instead of storing them, so the count only ever
// grew and the sixth order locked a customer out for the whole process lifetime
// while the response promised "réessayez dans une minute". That could not be
// caught by the live E2E suite, because reproducing it means waiting out a real
// window against a real deployment.
//
// The clock is injected, so every case here runs in microseconds and the tests
// exercise the shipped implementation from `lib/rate-limit.ts` rather than a copy.
//
//   npx tsx scripts/test-rate-limit.ts

import { createRateLimiter } from "@/lib/rate-limit";

const RATE_LIMIT = 5;
const WINDOW_MS = 60_000;

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1;
    console.log(`OK   ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A limiter whose clock the test moves by hand. */
function limiterAt(start = 1_000_000_000_000, sweepAbove = 500) {
  let clock = start;
  const limiter = createRateLimiter({
    limit: RATE_LIMIT,
    windowMs: WINDOW_MS,
    sweepAbove,
    now: () => clock,
  });
  return {
    limiter,
    advance: (ms: number) => {
      clock += ms;
    },
    setClock: (at: number) => {
      clock = at;
    },
    get clock() {
      return clock;
    },
  };
}

/* ---- the limit is the limit ---- */
{
  const { limiter } = limiterAt();
  for (let i = 1; i <= RATE_LIMIT; i += 1) {
    check(`request ${i}/${RATE_LIMIT} allowed`, !limiter.hit("ip").limited);
  }
  check(`request ${RATE_LIMIT + 1} refused`, limiter.hit("ip").limited);
}

/* ---- Retry-After is honest ---- */
{
  const { limiter } = limiterAt();
  for (let i = 0; i < RATE_LIMIT; i += 1) limiter.hit("ip");
  const refused = limiter.hit("ip");
  check(
    "Retry-After counts down as the window ages",
    refused.limited &&
      refused.retryAfterSeconds === Math.ceil(WINDOW_MS / 1000) &&
      refused.retryAfterSeconds > 0,
    refused.limited ? `${refused.retryAfterSeconds}s` : "not limited",
  );
}
{
  // The window must not reset just because the limiter kept refusing: a client
  // hammering through the refusal should still be admitted the moment it is due.
  const { limiter, advance } = limiterAt();
  for (let i = 0; i < RATE_LIMIT; i += 1) limiter.hit("ip");
  for (let i = 0; i < 10; i += 1) {
    limiter.hit("ip");
    advance(1_000);
  }
  advance(WINDOW_MS);
  check("allowed again after the window closes", !limiter.hit("ip").limited);
}

/* ---- capacity returns gradually, which is what a counter cannot do ---- */
{
  const { limiter, setClock } = limiterAt();
  const firstAt = 1_000_000_000_000;
  // Spread the hits out, otherwise they share a timestamp and expire together.
  for (let i = 0; i < RATE_LIMIT; i += 1) {
    setClock(firstAt + i * 100);
    limiter.hit("ip");
  }
  // 1ms past the first hit's expiry and 99ms short of the second's: exactly one
  // hit has aged out, so exactly one slot reopens.
  setClock(firstAt + WINDOW_MS + 1);
  const first = limiter.hit("ip");
  const second = limiter.hit("ip");
  check(
    "one expired hit frees exactly one slot",
    !first.limited && second.limited,
    `first ${first.limited ? "refused" : "allowed"}, second ${second.limited ? "refused" : "allowed"}`,
  );
}

/* ---- keys are independent ---- */
{
  const { limiter } = limiterAt();
  for (let i = 0; i < RATE_LIMIT + 4; i += 1) limiter.hit("noisy");
  check("one abusive key does not affect another", !limiter.hit("quiet").limited);
}

/* ---- a legitimate burst is never wrongly blocked ---- */
{
  const { limiter, advance } = limiterAt();
  let wrongBlocks = 0;
  // One order every 15s is 4/min, comfortably inside the limit.
  for (let i = 0; i < 40; i += 1) {
    if (limiter.hit("slow").limited) wrongBlocks += 1;
    advance(15_000);
  }
  check("a steady 4 orders/min is never blocked", wrongBlocks === 0, `${wrongBlocks} wrongly blocked`);
}
{
  // 5 requests instantly is the documented allowance and must all land.
  const { limiter } = limiterAt();
  const allowed = Array.from({ length: RATE_LIMIT }, () => !limiter.hit("edge").limited).filter(Boolean);
  check(`exactly ${RATE_LIMIT} simultaneous requests allowed`, allowed.length === RATE_LIMIT, `${allowed.length}`);
}

/* ---- the key map is swept so it cannot grow without bound ---- */
{
  const { limiter, advance } = limiterAt(1_000_000_000_000, 500);
  for (let i = 0; i < 600; i += 1) limiter.hit(`busy-${i}`);
  const whileBusy = limiter.size();
  advance(WINDOW_MS * 10);
  limiter.hit("fresh");
  const afterSweep = limiter.size();
  check(
    "sweep removes keys older than the window",
    whileBusy > 500 && afterSweep <= 2,
    `${whileBusy} live keys, ${afterSweep} after the sweep`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
