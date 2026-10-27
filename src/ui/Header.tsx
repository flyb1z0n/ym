import { Box, Text } from "ink";
import { GROUP_MODES, TABS, type GroupMode, type Row, type TabId } from "../core/filter.ts";
import type { Settings } from "../core/settings.ts";
import type { Status } from "../core/types.ts";
import { STATUS_STYLE } from "./format.ts";

export const greeting = ({ callMeMain }: Pick<Settings, "callMeMain">) =>
  `Yes, ${callMeMain ? "Main" : "Master"}!`;

/** Rows of the boxed logo as [border, text, border] pieces, so the border can be colored apart from the text. */
const logo = (text: string) => {
  const rule = "─".repeat(text.length + 2);
  return [[`╭${rule}╮`, "", ""], ["│ ", text, " │"], [`╰${rule}╯`, "", ""]] as const;
};

const SUMMARY: { status: Status; label: string }[] = [
  { status: "your_turn", label: "ready" },
  { status: "working", label: "working" },
  { status: "error", label: "error" },
  { status: "stale", label: "stale" },
  { status: "imported", label: "imported" },
  { status: "exited", label: "stopped" },
];

interface Props {
  rows: Row[];
  tab: TabId;
  counts: Record<TabId, number>;
  group: GroupMode;
  dimmed?: boolean;
  callMeMain?: boolean;
  /** The host this dashboard is viewed from through `ym ssh`. */
  remote?: string;
}

export const HEADER_HEIGHT = logo("").length + 1;

export function Header({ rows, tab, counts, group, dimmed = false, callMeMain = false, remote }: Props) {
  const active = rows.filter((r) => r.session.archivedAt === undefined);
  const summary = SUMMARY.map((s) => ({ ...s, n: active.filter((r) => r.status === s.status).length })).filter(
    (s) => s.n > 0 || s.status === "your_turn" || s.status === "working",
  );
  return (
    <Box flexDirection="column">
      <Box>
        <Box flexDirection="column" marginRight={1} flexShrink={0}>
          {logo(greeting({ callMeMain })).map(([left, text, right], i) => (
            <Text key={i} color={remote ? "magenta" : "green"} dimColor={dimmed}>
              {left}
              <Text color="green">{text}</Text>
              {right}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text dimColor={dimmed} wrap="truncate">
            {remote ? (
              <Text bold color="magenta">
                {`⇄ ${remote}  `}
              </Text>
            ) : null}
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
            <Text dimColor>{"  (^T)"}</Text>
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
