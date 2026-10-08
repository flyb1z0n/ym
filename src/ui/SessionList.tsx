import { Box, Text } from "ink";
import type { Group, GroupMode, Row, TabId } from "../core/filter.ts";
import { age, fit, folder, STATUS_STYLE, tildify, windowStart } from "./format.ts";

interface Props {
  groups: Group[];
  mode: GroupMode;
  selectedId: string | undefined;
  width: number;
  height: number;
  tab: TabId;
  dimmed?: boolean;
}

type Item = { kind: "header"; group: Group } | { kind: "row"; row: Row; nested: boolean };

const folderLabel = (row: Row) =>
  folder(row.session.cwd) + (row.session.addDirs?.length ? ` +${row.session.addDirs.length}` : "");

export function SessionList({ groups, mode, selectedId, width, height, tab, dimmed = false }: Props) {
  const bodyHeight = height - 2;
  if (groups.length === 0) {
    return (
      <Box borderStyle="round" width={width} height={height} paddingX={1}>
        <Text dimColor>
          {tab === "sessions"
            ? "No sessions. Type a prompt below to start one, or press Ctrl-O to import a Cursor chat."
            : "No archived sessions. Ctrl-A archives the selected one."}
        </Text>
      </Box>
    );
  }

  const items: Item[] = groups.flatMap((g): Item[] => [
    ...(g.label ? [{ kind: "header" as const, group: g }] : []),
    ...g.rows.map((row) => ({ kind: "row" as const, row, nested: !!g.label })),
  ]);
  const selected = Math.max(0, items.findIndex((i) => i.kind === "row" && i.row.session.id === selectedId));
  const start = windowStart(items.length, selected, bodyHeight);

  const inner = width - 4;
  const indent = mode === "date" ? 0 : 2;
  const statusWidth = mode === "status" ? 2 : 12;
  const ageWidth = 4;
  const folderWidth = mode === "folder" ? 0 : Math.min(16, Math.max(6, Math.floor(inner * 0.25)));
  const nameWidth = Math.max(4, inner - indent - statusWidth - (folderWidth ? folderWidth + 1 : 0) - ageWidth - 2);

  return (
    <Box borderStyle="round" width={width} height={height} flexDirection="column" paddingX={1}>
      {items.slice(start, start + bodyHeight).map((item, i) => {
        if (item.kind === "header") {
          const { group } = item;
          const color = group.status ? STATUS_STYLE[group.status].color : "green";
          return (
            <Text key={`h-${group.key}`} dimColor={dimmed} wrap="truncate">
              <Text bold color={color}>
                {group.status ? STATUS_STYLE[group.status].icon : "▸"} {mode === "folder" ? tildify(group.key) : group.label}
              </Text>
              <Text dimColor> {group.rows.length}</Text>
            </Text>
          );
        }
        const { row } = item;
        const style = STATUS_STYLE[row.status];
        const selectedRow = start + i === selected;
        return (
          <Text
            key={row.session.id}
            dimColor={dimmed}
            wrap="truncate"
            inverse={selectedRow}
            backgroundColor={selectedRow ? undefined : row.session.highlightColor}
          >
            {" ".repeat(item.nested ? indent : 0)}
            <Text color={style.color}>
              {fit(mode === "status" ? style.icon : `${style.icon} ${style.label}`, statusWidth)}
            </Text>
            <Text dimColor={row.session.archivedAt !== undefined}>{fit(row.session.name, nameWidth)}</Text>{" "}
            {folderWidth ? <Text dimColor>{`${fit(folderLabel(row), folderWidth)} `}</Text> : null}
            <Text dimColor>{age(row.lastActivity).padStart(ageWidth)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
