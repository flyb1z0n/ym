import { Box, Text } from "ink";
import type { Row } from "../core/filter.ts";
import { tildify } from "./format.ts";

interface Props {
  row: Row | undefined;
  content: string;
  width: number;
  height: number;
}

export function Preview({ row, content, width, height }: Props) {
  const bodyHeight = Math.max(1, height - 4);
  const lines = content
    .replace(/\s+$/, "")
    .replace(/\n(?:[ \t]*\n)+/g, "\n\n")
    .split("\n")
    .slice(-bodyHeight);
  return (
    <Box borderStyle="round" width={width} height={height} flexDirection="column" paddingX={1}>
      {row ? (
        <>
          <Text bold wrap="truncate">
            {row.session.name}
          </Text>
          <Text dimColor wrap="truncate">
            {tildify(row.session.cwd)}
            {row.session.worktree ? `  worktree ${row.session.worktree}` : ""}
            {row.session.model ? `  ${row.session.model}` : ""}
          </Text>
          {content ? (
            lines.map((line, i) => (
              <Text key={i} wrap="truncate">
                {line || " "}
              </Text>
            ))
          ) : (
            <Text dimColor>Not running. Press Enter to resume.</Text>
          )}
        </>
      ) : (
        <Text dimColor>No session selected.</Text>
      )}
    </Box>
  );
}
