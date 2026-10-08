import { Text, useInput } from "ink";
import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
}

/** Single-line input with readline-style editing keys. */
export function LineInput({ value, onChange, onSubmit, placeholder = "", focus = true }: Props) {
  const [cursor, setCursor] = useState(value.length);

  useEffect(() => {
    setCursor((c) => Math.min(c, value.length));
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
      if (key.home || (key.ctrl && input === "a")) return setCursor(0);
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
      <Text>
        <Text inverse>{placeholder[0] ?? " "}</Text>
        <Text dimColor>{placeholder.slice(1)}</Text>
      </Text>
    ) : (
      <Text dimColor>{placeholder}</Text>
    );
  }
  if (!focus) return <Text>{value}</Text>;
  return (
    <Text>
      {value.slice(0, cursor)}
      <Text inverse>{value[cursor] ?? " "}</Text>
      {value.slice(cursor + 1)}
    </Text>
  );
}
