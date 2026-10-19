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

/** Start index of each visual line, breaking after spaces when a word would overflow `width`. */
export function wrapStarts(text: string, width: number): number[] {
  const w = Math.max(1, width);
  const starts = [0];
  let pos = 0;
  while (text.length - pos > w) {
    const space = text.lastIndexOf(" ", pos + w - 1);
    pos = space >= pos ? space + 1 : pos + w;
    starts.push(pos);
  }
  return starts;
}

/** Visual lines the input needs, counting the cell the cursor sits on past the end. */
export const inputLineCount = (value: string, width: number) => wrapStarts(`${value} `, width).length;
