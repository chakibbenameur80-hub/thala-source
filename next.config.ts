import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Pin the Turbopack root to this folder.
   *
   * By default Next.js infers the root by walking up looking for a lockfile. In
   * this project that walk escapes into the home directory and either finds a
   * foreign `package-lock.json` (which is then ignored, with a warning) or — when
   * there is none — scopes the watcher to the entire home folder, which exhausts
   * memory during `next build`.
   *
   * Setting it explicitly makes the build deterministic on any machine.
   */
  turbopack: {
    root: path.join(import.meta.dirname),
  },
};

export default nextConfig;