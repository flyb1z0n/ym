/** The argv prefix that re-invokes this ym build (compiled binary or `bun src/cli.tsx`). */
export function selfCommand(): string[] {
  const compiled = Bun.main.startsWith("/$bunfs/") || Bun.main.startsWith("B:/~BUN/");
  return compiled ? [process.execPath] : [process.execPath, Bun.main];
}
