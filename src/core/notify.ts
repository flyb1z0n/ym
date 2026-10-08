const SCRIPT = [
  "on run argv",
  "display notification (item 2 of argv) with title (item 1 of argv)",
  "end run",
];

export function notify(title: string, message: string): void {
  if (process.platform !== "darwin" || process.env.YM_NO_NOTIFY) return;
  Bun.spawn(["osascript", ...SCRIPT.flatMap((l) => ["-e", l]), title, message], {
    stdout: "ignore",
    stderr: "ignore",
  });
}
