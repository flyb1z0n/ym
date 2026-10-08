import { Box, Text } from "ink";
import type { Row, TabId } from "../core/filter.ts";
import { age, fit, folder, STATUS_STYLE, windowStart } from "./format.ts";

interface Props {
  rows: Row[];
  selected: number;
  width: number;
  height: number;
  tab: TabId;
}

export function SessionList({ rows, selected, width, height, tab }: Props) {
  const inner = width - 4;
  const bodyHeight = height - 2;
  if (rows.length === 0) {
    return (
      <Box borderStyle="round" width={width} height={height} paddingX={1}>
        <Text dimColor>
          {tab === "all"
            ? "No sessions. Type a prompt below to start one, or press Ctrl-O to import a Cursor chat."
            : "Nothing here."}
        </Text>
      </Box>
    );
  }
  const start = windowStart(rows.length, selected, bodyHeight);
  const statusWidth = 12;
  const ageWidth = 4;
  const folderWidth = Math.min(16, Math.max(6, Math.floor(inner * 0.25)));
  const nameWidth = Math.max(4, inner - 2 - statusWidth - folderWidth - ageWidth - 3);

  return (
    <Box borderStyle="round" width={width} height={height} flexDirection="column" paddingX={1}>
      {rows.slice(start, start + bodyHeight).map((row, i) => {
        const isSelected = start + i === selected;
        const style = STATUS_STYLE[row.status];
        const archived = row.session.archivedAt !== undefined;
        return (
          <Text key={row.session.id} wrap="truncate" inverse={isSelected}>
            <Text color={style.color}>{fit(`${style.icon} ${style.label}`, statusWidth)}</Text>
            {"  "}
            <Text dimColor={archived}>{fit(row.session.name, nameWidth)}</Text>{" "}
            <Text dimColor>
              {fit(
                folder(row.session.cwd) + (row.session.addDirs?.length ? ` +${row.session.addDirs.length}` : ""),
                folderWidth,
              )}
            </Text>{" "}
            <Text dimColor>{age(row.lastActivity).padStart(ageWidth)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
