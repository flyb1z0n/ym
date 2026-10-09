import { Box, Text } from "ink";
import { GROUP_MODES, TABS, type GroupMode, type Row, type TabId } from "../core/filter.ts";
import type { Status } from "../core/types.ts";
import { STATUS_STYLE, tildify } from "./format.ts";

const LOGO = [
  "        ╭──────────────╮",
  " (^_^)7 ┤ Yes, Master! │",
  "        ╰──────────────╯",
];
const COMPACT_LOGO = ["(^_^)7 ym"];
const MIN_LOGO_WIDTH = Math.max(...LOGO.map((line) => line.length));

const SUMMARY: { status: Status; label: string }[] = [
  { status: "your_turn", label: "ready" },
  { status: "working", label: "working" },
  { status: "error", label: "error" },
  { status: "stale", label: "stale" },
  { status: "exited", label: "exited" },
  { status: "imported", label: "imported" },
];

interface Props {
  model: string | undefined;
  folder: string;
  rows: Row[];
  tab: TabId;
  counts: Record<TabId, number>;
  group: GroupMode;
  width: number;
  dimmed?: boolean;
}

export function headerHeightFor(width: number): number {
  return (width < MIN_LOGO_WIDTH ? COMPACT_LOGO.length : LOGO.length) + 1;
}

export function Header({ model, folder, rows, tab, counts, group, width, dimmed = false }: Props) {
  const active = rows.filter((r) => r.session.archivedAt === undefined);
  const summary = SUMMARY.map((s) => ({ ...s, n: active.filter((r) => r.status === s.status).length })).filter(
    (s) => s.n > 0 || s.status === "your_turn" || s.status === "working",
  );
  const logo = width < MIN_LOGO_WIDTH ? COMPACT_LOGO : LOGO;
  return (
    <Box flexDirection="column">
      <Box>
        <Box flexDirection="column" marginRight={1}>
          {logo.map((line, i) => (
            <Text key={i} color="green" dimColor={dimmed}>
              {line}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold dimColor={dimmed} wrap="truncate">
            YesMaster <Text dimColor>· {model ?? "Cursor"} · {tildify(folder)}</Text>
          </Text>
          <Text dimColor={dimmed} wrap="truncate">
            {summary.map((s, i) => (
              <Text key={s.status}>
                {i > 0 ? <Text dimColor> · </Text> : null}
                <Text color={s.n ? STATUS_STYLE[s.status].color : undefined} dimColor={!s.n}>
                  {`${s.n} ${s.label}`}
                </Text>
              </Text>
            ))}
          </Text>
          <Text wrap="truncate">
            <Text dimColor>group by: </Text>
            {GROUP_MODES.map((m, i) => (
              <Text key={m.id}>
                {i > 0 ? <Text dimColor> · </Text> : null}
                {m.id === group ? (
                  <Text bold color="green" dimColor={dimmed}>
                    {m.label}
                  </Text>
                ) : (
                  <Text dimColor>{m.label}</Text>
                )}
              </Text>
            ))}
            <Text dimColor>{"  (⇧Tab)"}</Text>
          </Text>
        </Box>
      </Box>
      <Text dimColor={dimmed} wrap="truncate">
        {TABS.map((t) => (
          <Text key={t.id}>
            <Text inverse={t.id === tab} bold={t.id === tab}>{` ${t.label} ${counts[t.id]} `}</Text>
            {"  "}
          </Text>
        ))}
        <Text dimColor>(Tab)</Text>
      </Text>
    </Box>
  );
}
