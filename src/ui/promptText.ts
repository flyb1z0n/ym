import type { Session } from "../core/types.ts";
import { tildify } from "./format.ts";

export interface Highlight {
  start: number;
  end: number;
  color: string;
}

const FOLDER_TAG = /(^|\s)(@\S+)/g;
const IMAGE_MARKER = /\[Image #\d+\]/g;

/** Colors for `@folder` tags and `[Image #N]` markers; markers win where they overlap. */
export function promptHighlights(text: string): Highlight[] {
  const folders = [...text.matchAll(FOLDER_TAG)].map((m) => {
    const start = m.index + m[1]!.length;
    return { start, end: start + m[2]!.length, color: "cyan" };
  });
  const images = [...text.matchAll(IMAGE_MARKER)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    color: "magenta",
  }));
  return [...folders, ...images];
}

/**
 * Input that starts another session like `s`: its folders as @tags, then its prompt.
 * `fallback` stands in for a prompt ym didn't save; it has no images, so its markers are dropped.
 */
export function repeatInput(s: Session, fallback?: string): { text: string; images: string[] } | undefined {
  const prompt = s.prompt ?? fallback?.replace(/\[Image #\d+\][^\S\n]*/g, "").trim();
  if (!prompt) return undefined;
  const tags = [s.cwd, ...(s.addDirs ?? [])].map((dir) => `@${tildify(dir)} `).join("");
  return { text: tags + prompt, images: s.prompt ? (s.images ?? []) : [] };
}

/**
 * Start index of each visual line, breaking after spaces when a word would overflow `width`
 * and after every "\n", which takes up a cell at the end of its line.
 */
export function wrapStarts(text: string, width: number): number[] {
  const w = Math.max(1, width);
  const starts = [0];
  let pos = 0;
  for (;;) {
    const newline = text.indexOf("\n", pos);
    const end = newline === -1 ? text.length : newline + 1;
    while (end - pos > w) {
      const space = text.lastIndexOf(" ", pos + w - 1);
      pos = space >= pos ? space + 1 : pos + w;
      starts.push(pos);
    }
    if (newline === -1) return starts;
    pos = end;
    starts.push(pos);
  }
}

/** Visual lines the input needs, counting the cell the cursor sits on past the end. */
export const inputLineCount = (value: string, width: number) => wrapStarts(`${value} `, width).length;
