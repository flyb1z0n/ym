import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { AGENT_NAMES, AGENTS } from "../core/agents.ts";
import { namingModel } from "../core/naming.ts";
import type { Settings } from "../core/settings.ts";
import { greeting } from "./Header.tsx";

interface Props {
  settings: Settings;
  width: number;
  height: number;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

interface Row {
  key: keyof Settings;
  label: string;
  describe: (s: Settings) => string;
  /** Shown value; on/off for flags. */
  value?: (s: Settings) => string;
  /** Next value; flips flags. */
  next?: (s: Settings) => Settings;
}

const ROWS: Row[] = [
  {
    key: "defaultAgent",
    label: "Default agent",
    describe: (s) =>
      `Prompts go to ${AGENT_NAMES[s.defaultAgent]} unless they're tagged ${AGENTS.filter((a) => a !== s.defaultAgent)
        .map((a) => `#${a}`)
        .join(" or ")}.`,
    value: (s) => AGENT_NAMES[s.defaultAgent],
    next: (s) => ({ ...s, defaultAgent: AGENTS[(AGENTS.indexOf(s.defaultAgent) + 1) % AGENTS.length]! }),
  },
  {
    key: "useWorktrees",
    label: "Use worktrees for new sessions",
    describe: (s) =>
      s.useWorktrees
        ? "New sessions in git repos start in isolated worktrees; other folders open directly."
        : "New sessions start in their selected folders.",
  },
  {
    key: "nameWorktrees",
    label: "Name worktrees from the prompt",
    describe: (s) => {
      if (!s.useWorktrees) return "Only applies when worktrees are on.";
      return s.nameWorktrees
        ? `${namingModel()} names the worktree and branch before launch (adds ~8 s).`
        : "Worktrees and branches are named after the session id.";
    },
  },
  {
    key: "callMeMain",
    label: "Call me Main instead of Master",
    describe: (s) => `The header says "${greeting(s)}"`,
  },
];

const shown = (row: Row, s: Settings) => row.value?.(s) ?? (s[row.key] ? "on" : "off");
const advance = (row: Row, s: Settings): Settings => row.next?.(s) ?? { ...s, [row.key]: !s[row.key] };

export function SettingsView({ settings, width, height, onChange, onClose }: Props) {
  const [selected, setSelected] = useState(0);
  const label = Math.max(...ROWS.map((r) => r.label.length));
  const valueWidth = Math.max(3, ...ROWS.map((r) => shown(r, settings).length));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "s")) return onClose();
    if (key.upArrow) return setSelected((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSelected((i) => Math.min(ROWS.length - 1, i + 1));
    if (key.return || input === " ") onChange(advance(ROWS[selected]!, settings));
  });

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      <Text bold color="green">
        ym settings
      </Text>
      <Text dimColor>Changes are saved immediately.</Text>
      {ROWS.map((row, i) => (
        <Box key={row.key} flexDirection="column" marginTop={1}>
          <Text inverse={i === selected}>
            {` ${row.label.padEnd(label)}  ${shown(row, settings).padEnd(valueWidth)} `}
          </Text>
          <Text dimColor>{row.describe(settings)}</Text>
        </Box>
      ))}
      <Box flexGrow={1} />
      <Text dimColor>↑↓ select · Space or Enter changes · Ctrl-S or Esc returns</Text>
    </Box>
  );
}
