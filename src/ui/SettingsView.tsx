import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { namingModel } from "../core/naming.ts";
import type { Settings } from "../core/settings.ts";

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
}

const ROWS: Row[] = [
  {
    key: "useWorktrees",
    label: "Use worktrees for new sessions",
    describe: (s) =>
      s.useWorktrees
        ? "New sessions in git repos start in isolated Cursor worktrees; other folders open directly."
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
];

export function SettingsView({ settings, width, height, onChange, onClose }: Props) {
  const [selected, setSelected] = useState(0);
  const label = Math.max(...ROWS.map((r) => r.label.length));

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "s")) return onClose();
    if (key.upArrow) return setSelected((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSelected((i) => Math.min(ROWS.length - 1, i + 1));
    if (key.return || input === " ") {
      const { key: name } = ROWS[selected]!;
      onChange({ ...settings, [name]: !settings[name] });
    }
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
            {` ${row.label.padEnd(label)}  ${settings[row.key] ? "on " : "off"} `}
          </Text>
          <Text dimColor>{row.describe(settings)}</Text>
        </Box>
      ))}
      <Box flexGrow={1} />
      <Text dimColor>↑↓ select · Space or Enter toggles · Ctrl-S or Esc returns</Text>
    </Box>
  );
}
