import { statSync } from "node:fs";

export const isCompiled = () => Bun.main.startsWith("/$bunfs/") || Bun.main.startsWith("B:/~BUN/");

/** The release this binary was built as, or "dev" for source runs and local builds. */
export const VERSION = process.env.YM_VERSION || "dev";

/** The argv prefix that re-invokes this ym build (compiled binary or `bun src/cli.tsx`). */
export function selfCommand(): string[] {
  return isCompiled() ? [process.execPath] : [process.execPath, Bun.main];
}

/** Changes whenever the binary (or dev entry file) is rebuilt. */
export function buildId(): string {
  try {
    const s = statSync(isCompiled() ? process.execPath : Bun.main);
    return `${Math.round(s.mtimeMs)}-${s.size}`;
  } catch {
    return "unknown";
  }
}
