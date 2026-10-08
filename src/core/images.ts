import { realpathSync, statSync } from "node:fs";
import { expandHome } from "./paths.ts";

/** Formats Cursor accepts as image attachments. */
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp)$/i;
const MARKER = /\[Image #(\d+)\]/g;
// Only ASCII whitespace separates paths: macOS screenshot names contain U+202F, which `\s` matches.
const PATH_TOKEN = /"[^"\n]+"|'[^'\n]+'|(?:\\.|[^ \t\r\n"'])+/g;

function resolveImage(token: string): string | undefined {
  let path = token;
  if (/^(["']).*\1$/.test(path)) path = path.slice(1, -1);
  else path = path.replace(/\\(.)/g, "$1");
  if (path.startsWith("file://")) {
    try {
      path = decodeURI(new URL(path).pathname);
    } catch {
      return undefined;
    }
  }
  path = expandHome(path);
  if (!IMAGE_EXT.test(path)) return undefined;
  try {
    return statSync(path).isFile() ? realpathSync(path) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Replaces image file paths in pasted text (what terminals send for drag-and-drop) with
 * `[Image #N]` markers, where N indexes the returned `images`.
 */
export function attachPastedImages(text: string, images: string[]): { text: string; images: string[] } {
  const next = [...images];
  const replaced = text.replace(PATH_TOKEN, (token) => {
    const path = resolveImage(token);
    if (!path) return token;
    const i = next.includes(path) ? next.indexOf(path) : next.push(path) - 1;
    return `[Image #${i + 1}]`;
  });
  return { text: replaced, images: next };
}

/** Images whose markers are still in the text. */
export function referencedImages(text: string, images: string[]): string[] {
  const used = new Set([...text.matchAll(MARKER)].map((m) => images[Number(m[1]) - 1]));
  return images.filter((p) => used.has(p));
}

/**
 * The prompt as separate pastes for Cursor's prompt bar: it attaches a pasted image only when
 * the paste is the escaped path alone, and adds a space after the attachment itself.
 */
export function promptPastes(text: string, images: string[]): string[] {
  const pastes: string[] = [];
  let last = 0;
  const pushText = (upTo: number) => {
    const chunk = last > 0 ? text.slice(last, upTo).replace(/^ /, "") : text.slice(0, upTo);
    if (chunk) pastes.push(chunk);
  };
  for (const m of text.matchAll(MARKER)) {
    const path = images[Number(m[1]) - 1];
    if (!path) continue;
    pushText(m.index);
    pastes.push(path.replace(/([\s()])/g, "\\$1"));
    last = m.index + m[0].length;
  }
  pushText(text.length);
  return pastes;
}

export const stripImageMarkers = (text: string) => text.replace(MARKER, " ").replace(/\s+/g, " ").trim();
