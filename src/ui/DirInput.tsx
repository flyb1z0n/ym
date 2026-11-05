import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import { completeDir } from "../core/folders.ts";
import { tildify } from "./format.ts";
import { LineInput } from "./LineInput.tsx";

/** Most folders listed under the input. */
export const DIR_SUGGESTIONS = 5;

export const DIR_KEYS = "↑↓ pick · Tab completes · Enter saves · Esc cancels";

interface Props {
  value: string;
  /** Columns for the marker, the input, and the folders below it. */
  width: number;
  color: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/** Folder path input listing the folders that complete it; ↑↓ choose one and Tab fills it in. */
export function DirInput({ value, width, color, onChange, onSubmit }: Props) {
  const [selected, setSelected] = useState(0);
  const suggestions = useMemo(() => completeDir(value, DIR_SUGGESTIONS), [value]);
  const index = Math.min(selected, Math.max(0, suggestions.length - 1));

  const change = (next: string) => {
    setSelected(0);
    onChange(next);
  };

  useInput((_input, key) => {
    if (key.upArrow) return setSelected(Math.max(0, index - 1));
    if (key.downArrow) return setSelected(Math.min(suggestions.length - 1, index + 1));
    const path = suggestions[index];
    if (key.tab && !key.shift && path) change(`${tildify(path)}/`);
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>› </Text>
        <LineInput value={value} width={Math.max(1, width - 2)} onChange={change} onSubmit={onSubmit} />
      </Box>
      {suggestions.map((path, i) => (
        <Box key={path}>
          <Text>{"  "}</Text>
          <Text inverse={i === index} color="cyan" wrap="truncate-start">
            {`${tildify(path)}/`}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
