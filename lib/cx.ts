/**
 * Tiny className joiner.
 *
 * The project has no CSS-in-JS dependency, so conditional classes are built
 * with a `clsx`-compatible filter instead of pulling in a package.
 */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
