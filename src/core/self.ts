import { statSync } from "node:fs";

const isCompiled = () => Bun.main.startsWith("/$bunfs/") || Bun.main.startsWith("B:/~BUN/");

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
