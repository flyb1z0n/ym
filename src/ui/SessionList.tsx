import { Box, Text } from "ink";
import type { Group, GroupMode, Row, TabId } from "../core/filter.ts";
import { agentOf } from "../core/agents.ts";
import type { Agent, Status } from "../core/types.ts";
import { age, fit, folder, STATUS_STYLE, tildify, windowStart } from "./format.ts";
import { useSpinner } from "./useSpinner.ts";

interface Props {
  groups: Group[];
  mode: GroupMode;
  selectedId: string | undefined;
  width: number;
  height: number;
  tab: TabId;
  dimmed?: boolean;
  /** Rows on another agent get a label; default-agent rows stay unlabelled. */
  defaultAgent: Agent;
}

type Item = { kind: "header"; group: Group } | { kind: "row"; row: Row; nested: boolean; pinned: boolean };

const folderLabel = (row: Row) =>
  folder(row.session.cwd) + (row.session.addDirs?.length ? ` +${row.session.addDirs.length}` : "");

export function SessionList({ groups, mode, selectedId, width, height, tab, dimmed = false, defaultAgent }: Props) {
  const spinner = useSpinner(groups.some((g) => g.rows.some((r) => r.status === "working")));
  const icon = (status: Status) => (status === "working" ? spinner : STATUS_STYLE[status].icon);
  const bodyHeight = height;
  if (groups.length === 0) {
    return (
      <Box width={width} height={height} paddingX={1}>
        <Text dimColor>
          {tab === "sessions"
            ? "No sessions. Type a prompt below to start one, or press Ctrl-O to import a past chat."
            : "No archived sessions. Ctrl-A archives the selected one."}
        </Text>
      </Box>
    );
  }

  const items: Item[] = groups.flatMap((g): Item[] => [
    ...(g.label ? [{ kind: "header" as const, group: g }] : []),
    ...g.rows.map((row) => ({ kind: "row" as const, row, nested: !!g.label, pinned: !!g.pinned })),
  ]);
  const selected = Math.max(0, items.findIndex((i) => i.kind === "row" && i.row.session.id === selectedId));
  const start = windowStart(items.length, selected, bodyHeight);

  const inner = width - 2;
  const indent = groups.some((g) => g.label) ? 2 : 0;
  const statusWidth = mode === "status" ? 2 : 12;
  const ageWidth = 4;
  const folderColumn = Math.min(16, Math.max(6, Math.floor(inner * 0.25)));
  // Folder mode names the folder in each header, except the Pinned one, which mixes folders.
  const folderWidthFor = (pinned: boolean) => (mode === "folder" && !pinned ? 0 : folderColumn);
  const nameWidthFor = (folderWidth: number) =>
    Math.max(4, inner - indent - statusWidth - (folderWidth ? folderWidth + 1 : 0) - ageWidth - 2);

  return (
    <Box width={width} height={height} flexDirection="column" paddingX={1}>
      {items.slice(start, start + bodyHeight).map((item, i) => {
        if (item.kind === "header") {
          const { group } = item;
          const color = group.status ? STATUS_STYLE[group.status].color : group.pinned ? "magenta" : "green";
          return (
            <Text key={`h-${group.key}`} dimColor={dimmed} wrap="truncate">
              <Text bold color={color}>
                {group.status ? icon(group.status) : group.pinned ? "★" : "▸"}{" "}
                {mode === "folder" && !group.pinned ? tildify(group.key) : group.label}
              </Text>
              <Text dimColor> {group.rows.length}</Text>
            </Text>
          );
        }
        const { row } = item;
        const style = STATUS_STYLE[row.status];
        const selectedRow = start + i === selected;
        const agent = agentOf(row.session);
        const agentLabel = agent === defaultAgent ? "" : ` ${agent}`;
        const folderWidth = folderWidthFor(item.pinned);
        const nameWidth = nameWidthFor(folderWidth);
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
              {fit(mode === "status" ? icon(row.status) : `${icon(row.status)} ${style.label}`, statusWidth)}
            </Text>
            <Text dimColor={row.session.archivedAt !== undefined}>
              {fit(row.session.name, Math.max(1, nameWidth - agentLabel.length))}
            </Text>
            {agentLabel ? <Text dimColor>{agentLabel}</Text> : null}{" "}
            {folderWidth ? <Text dimColor>{`${fit(folderLabel(row), folderWidth)} `}</Text> : null}
            <Text dimColor>{age(row.lastActivity).padStart(ageWidth)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
