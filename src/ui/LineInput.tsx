import { Text, useInput } from "ink";
import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  /** Visible columns; longer values scroll to keep the cursor in view. */
  width?: number;
}

/** Single-line input with readline-style editing keys. */
export function LineInput({ value, onChange, onSubmit, placeholder = "", focus = true, width }: Props) {
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
  const start = width && value.length >= width ? Math.max(0, Math.min(cursor - width + 1, value.length - width + 1)) : 0;
  const end = width ? start + width : undefined;
  if (!focus) return <Text wrap="truncate">{value.slice(start, end)}</Text>;
  return (
    <Text wrap="truncate">
      {value.slice(start, cursor)}
      <Text inverse>{value[cursor] ?? " "}</Text>
      {value.slice(cursor + 1, end)}
    </Text>
  );
}
