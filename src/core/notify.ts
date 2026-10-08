import { tmux } from "./tmux.ts";

const SCRIPT = [
  "on run argv",
  "display notification (item 2 of argv) with title (item 1 of argv)",
  "end run",
];

/** Terminals that post OSC 9 notifications under their own app identity. */
const OSC9_TERMINALS = /^(iTerm2|ghostty|WezTerm|kitty)\b/i;

export const supportsOsc9 = (termType: string) => OSC9_TERMINALS.test(termType);

/** OSC 9 wrapped in tmux DCS passthrough; control characters are stripped so text can't end the sequence early. */
export function osc9Passthrough(text: string): string {
  const osc = `\x1b]9;${text.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")}\x07`;
  return `\x1bPtmux;${osc.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
}

const attachedTermTypes = () =>
  tmux(["list-clients", "-F", "#{client_termtype}"]).stdout.split("\n").filter(Boolean);

export function notify(title: string, message: string): void {
  if (process.platform !== "darwin" || process.env.YM_NO_NOTIFY) return;
  // osascript notifications belong to Script Editor (its icon, and clicking opens it), so prefer the terminal's own.
  const termTypes = process.env.TMUX ? attachedTermTypes() : [];
  if (termTypes.length > 0 && termTypes.every(supportsOsc9)) {
    process.stdout.write(osc9Passthrough(`${title}: ${message}`));
    return;
  }
  Bun.spawn(["osascript", ...SCRIPT.flatMap((l) => ["-e", l]), title, message], {
    stdout: "ignore",
    stderr: "ignore",
  });
}
