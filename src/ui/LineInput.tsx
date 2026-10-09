import { Box, Text, useInput, usePaste } from "ink";
import { useEffect, useRef, useState } from "react";
import { wrapStarts, type Highlight } from "./promptText.ts";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Rewrites pasted text (including drag-and-dropped file paths) before it's inserted. */
  transformPaste?: (text: string) => string;
  placeholder?: string;
  focus?: boolean;
  /** Visible columns; longer values scroll to keep the cursor in view. */
  width?: number;
  /** With `width`, wraps onto up to this many lines instead of scrolling sideways. */
  maxLines?: number;
  /** Colored ranges of the value. */
  highlights?: (value: string) => Highlight[];
}

/** Text input with readline-style editing keys. */
export function LineInput({
  value,
  onChange,
  onSubmit,
  transformPaste,
  placeholder = "",
  focus = true,
  width,
  maxLines = 1,
  highlights,
}: Props) {
  const [cursor, setCursor] = useState(value.length);
  const previous = useRef(value);

  // External edits (e.g. autocomplete) keep a cursor that was at the end at the end.
  useEffect(() => {
    const wasAtEnd = cursor === previous.current.length;
    previous.current = value;
    setCursor((c) => (wasAtEnd ? value.length : Math.min(c, value.length)));
  }, [value]);

  useInput(
    (input, key) => {
      if (key.upArrow || key.downArrow || key.tab || key.escape) return;
      if (key.return) return onSubmit?.(value);
      const edit = (next: string, at: number) => {
        onChange(next);
        setCursor(at);
      };
      if (key.leftArrow) return setCursor(Math.max(0, cursor - 1));
      if (key.rightArrow) return setCursor(Math.min(value.length, cursor + 1));
      if (key.home) return setCursor(0);
      if (key.end || (key.ctrl && input === "e")) return setCursor(value.length);
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        return edit(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
      }
      if (key.ctrl && input === "u") return edit(value.slice(cursor), 0);
      if (key.ctrl && input === "k") return edit(value.slice(0, cursor), cursor);
      if (key.ctrl && input === "w") {
        const start = value.slice(0, cursor).replace(/\S+\s*$/, "").length;
        return edit(value.slice(0, start) + value.slice(cursor), start);
      }
      if (key.ctrl || key.meta || !input) return;
      const text = input.replace(/[\r\n]+/g, " ");
      edit(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
    },
    { isActive: focus },
  );

  usePaste(
    (pasted) => {
      const text = (transformPaste?.(pasted) ?? pasted).replace(/[\r\n]+/g, " ");
      onChange(value.slice(0, cursor) + text + value.slice(cursor));
      setCursor(cursor + text.length);
    },
    { isActive: focus },
  );

  if (!value) {
    return focus ? (
      <Text wrap="truncate">
        <Text inverse> </Text>
        <Text dimColor>{placeholder}</Text>
      </Text>
    ) : (
      <Text dimColor wrap="truncate">
        {placeholder}
      </Text>
    );
  }
  if (width && maxLines > 1) {
    return (
      <WrappedText
        value={value}
        cursor={cursor}
        active={focus}
        width={width}
        maxLines={maxLines}
        highlights={highlights?.(value) ?? []}
      />
    );
  }
  const start = width && value.length >= width ? Math.max(0, Math.min(cursor - width + 1, value.length - width + 1)) : 0;
  const end = width ? start + width : undefined;
  if (!focus) return <Text dimColor wrap="truncate">{value.slice(start, end)}</Text>;
  return (
    <Text wrap="truncate">
      {value.slice(start, cursor)}
      <Text inverse>{value[cursor] ?? " "}</Text>
      {value.slice(cursor + 1, end)}
    </Text>
  );
}

interface WrappedProps {
  value: string;
  cursor: number;
  active: boolean;
  width: number;
  maxLines: number;
  highlights: Highlight[];
}

/** Word-wrapped value, scrolled so the cursor's line stays within `maxLines`. */
function WrappedText({ value, cursor, active, width, maxLines, highlights }: WrappedProps) {
  const text = `${value} `;
  const colors: (string | undefined)[] = Array.from(text, () => undefined);
  for (const h of highlights) colors.fill(h.color, h.start, h.end);
  const starts = wrapStarts(text, width);
  const cursorLine = starts.findLastIndex((s) => s <= cursor);
  const first = Math.max(0, cursorLine - maxLines + 1);

  return (
    <Box flexDirection="column">
      {starts.slice(first, first + maxLines).map((start, i) => {
        const end = starts[first + i + 1] ?? text.length;
        const runs: { text: string; color?: string; inverse: boolean }[] = [];
        for (let at = start; at < end; at++) {
          const inverse = active && at === cursor;
          const last = runs.at(-1);
          if (last && last.color === colors[at] && last.inverse === inverse) last.text += text[at];
          else runs.push({ text: text[at]!, color: colors[at], inverse });
        }
        return (
          <Text key={start} dimColor={!active} wrap="truncate">
            {runs.map((run, j) => (
              <Text key={j} color={run.color} inverse={run.inverse}>
                {run.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </Box>
  );
}
