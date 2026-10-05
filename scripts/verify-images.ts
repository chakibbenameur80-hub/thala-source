// Run via `npm run verify:images`, not `npx tsx`.
//
// That wrapper adds `--conditions=react-server`, and this file depends on it:
// `lib/images.ts` carries `import "server-only"`, and the `server-only` package
// resolves to its `react-server` export (an empty module) under that condition but
// to a throwing module otherwise. Next.js always sets the condition when it
// compiles a Server Component; a bare `tsx` run does not, and dies on import.
// The guard is working as designed here — just confusing without the flag.
import sharp from "sharp";
import { prepareImage, MAX_IMAGE_BYTES } from "../lib/images";

/** Builds a real image buffer for the given declared type. */
async function makeImage(
  type: "jpeg" | "png" | "webp",
  width: number,
  height: number,
): Promise<{ bytes: Buffer; type: string }> {
  // A gradient + noise so the re-encode has real work to do.
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = ((x ^ y) + (Math.random() * 40)) % 255;
    }
  }
  let pipeline = sharp(raw, { raw: { width, height, channels: 3 } });
  if (type === "jpeg") pipeline = pipeline.jpeg({ quality: 95 });
  if (type === "png") pipeline = pipeline.png();
  if (type === "webp") pipeline = pipeline.webp({ quality: 90 });
  return { bytes: await pipeline.toBuffer(), type: `image/${type}` };
}

/** Wraps a buffer as a `File`, which is what the route receives from the browser. */
async function asFile(bytes: Buffer, name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function expectError(label: string, fn: () => Promise<unknown>, pattern: RegExp) {
  try {
    await fn();
    check(label, false, "no error thrown");
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    check(label, pattern.test(msg), msg);
  }
}

/** Identity helper, purely for call-site readability. */
const rejected = (fn: () => Promise<unknown>) => fn;

async function main() {
  console.log(`MAX_IMAGE_BYTES = ${MAX_IMAGE_BYTES} (${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB)\n`);

  // 1. JPEG is re-encoded to webp and resized down.
  {
    const src = await makeImage("jpeg", 2400, 1800);
    const out = await prepareImage(await asFile(src.bytes, "photo.jpg", "image/jpeg"));
    check("jpeg accepted", out.contentType === "image/webp", out.contentType);
    check("longest edge capped at 1600", Math.max(out.width, out.height) <= 1600, `${out.width}x${out.height}`);
    check("aspect ratio preserved", Math.abs(out.width / out.height - 2400 / 1800) < 0.01, `${out.width}x${out.height}`);
    check("smaller than source", out.bytes.byteLength < src.bytes.byteLength, `${src.bytes.byteLength} -> ${out.bytes.byteLength}`);
    console.log(`     source ${(src.bytes.byteLength/1024).toFixed(0)}KB -> webp ${(out.bytes.byteLength/1024).toFixed(0)}KB`);
  }

  // 2. PNG and WEBP inputs both work.
  for (const type of ["png", "webp"] as const) {
    const src = await makeImage(type, 800, 800);
    const out = await prepareImage(await asFile(src.bytes, `photo.${type}`, `image/${type}`));
    check(`${type} accepted`, out.contentType === "image/webp", out.contentType);
  }

  // 3. Small image is NOT enlarged.
  {
    const src = await makeImage("png", 100, 100);
    const out = await prepareImage(await asFile(src.bytes, "tiny.png", "image/png"));
    check("small image not upscaled", out.width === 100 && out.height === 100, `${out.width}x${out.height}`);
  }

  // 4. Unsupported declared type is refused.
  await expectError(
    "gif refused",
    rejected(async () => prepareImage(await asFile(Buffer.from("GIF89a"), "a.gif", "image/gif"))),
    /non pris en charge/i,
  );
  await expectError(
    "pdf refused",
    rejected(async () =>
      prepareImage(await asFile(Buffer.from("%PDF-1.4"), "a.pdf", "application/pdf")),
    ),
    /non pris en charge/i,
  );

  // 5. A file that lies about its type (says jpeg, is actually HTML).
  await expectError(
    "renamed non-image refused",
    rejected(async () =>
      prepareImage(
        await asFile(Buffer.from("<!doctype html><h1>not an image</h1>"), "evil.jpg", "image/jpeg"),
      ),
    ),
    /illisible|corrompue/i,
  );

  // 6. Empty file.
  await expectError(
    "empty file refused",
    rejected(async () => prepareImage(await asFile(Buffer.alloc(0), "empty.jpg", "image/jpeg"))),
    /illisible|corrompue/i,
  );

  // 7. Oversized file is refused before decoding.
  {
    const huge = Buffer.alloc(MAX_IMAGE_BYTES + 1024, 0x41);
    await expectError(
      "oversized file refused",
      rejected(async () => prepareImage(await asFile(huge, "huge.jpg", "image/jpeg"))),
      /trop volumineuse/i,
    );
  }

  // 8. Truncated real JPEG.
  {
    const src = await makeImage("jpeg", 600, 600);
    await expectError(
      "truncated jpeg refused",
      rejected(async () =>
        prepareImage(await asFile(src.bytes.subarray(0, 120), "cut.jpg", "image/jpeg")),
      ),
      /illisible|corrompue/i,
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

void main();
