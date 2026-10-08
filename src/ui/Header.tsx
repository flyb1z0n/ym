import { Box, Text } from "ink";
import { GROUP_MODES, TABS, type GroupMode, type Row, type TabId } from "../core/filter.ts";
import type { Status } from "../core/types.ts";
import { STATUS_STYLE, tildify } from "./format.ts";

const LOGO = [" ▗▄▖ ", " ▐▓▌ ", " ▝▀▘ "];

const SUMMARY: { status: Status; label: string }[] = [
  { status: "your_turn", label: "your turn" },
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
}

export const HEADER_HEIGHT = LOGO.length + 1;

export function Header({ model, folder, rows, tab, counts, group }: Props) {
  const active = rows.filter((r) => r.session.archivedAt === undefined);
  const summary = SUMMARY.map((s) => ({ ...s, n: active.filter((r) => r.status === s.status).length })).filter(
    (s) => s.n > 0 || s.status === "your_turn" || s.status === "working",
  );
  return (
    <Box flexDirection="column">
      <Box>
        <Box flexDirection="column" marginRight={1}>
          {LOGO.map((line, i) => (
            <Text key={i} color="green">
              {line}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold wrap="truncate">
            ym <Text dimColor>· {model ?? "Cursor"} · {tildify(folder)}</Text>
          </Text>
          <Text wrap="truncate">
            {summary.map((s, i) => (
              <Text key={s.status}>
                {i > 0 ? <Text dimColor> · </Text> : null}
                <Text color={s.n ? STATUS_STYLE[s.status].color : undefined} dimColor={!s.n}>
                  {`${s.n} ${s.label}`}
                </Text>
              </Text>
            ))}
          </Text>
          <Text dimColor wrap="truncate">
            group by{" "}
            {GROUP_MODES.map((m, i) => (
              <Text key={m.id}>
                {i > 0 ? " · " : ""}
                <Text bold={m.id === group} dimColor={m.id !== group} color={m.id === group ? "green" : undefined}>
                  {m.label}
                </Text>
              </Text>
            ))}
            {"  (⇧Tab)"}
          </Text>
        </Box>
      </Box>
      <Text wrap="truncate">
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
