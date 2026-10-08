import { Box, Text, useInput } from "ink";
import type { Settings } from "../core/settings.ts";

interface Props {
  settings: Settings;
  width: number;
  height: number;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsView({ settings, width, height, onChange, onClose }: Props) {
  const toggleWorktrees = () => onChange({ ...settings, useWorktrees: !settings.useWorktrees });

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "s")) return onClose();
    if (key.return || input === " ") toggleWorktrees();
  });

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      <Text bold color="green">
        ym settings
      </Text>
      <Text dimColor>Changes are saved immediately.</Text>
      <Text> </Text>
      <Text inverse>
        {` Use worktrees for new sessions  ${settings.useWorktrees ? "on " : "off"} `}
      </Text>
      <Text dimColor>
        {settings.useWorktrees
          ? "New sessions start in isolated Cursor worktrees."
          : "New sessions start in their selected folders."}
      </Text>
      <Box flexGrow={1} />
      <Text dimColor>Space or Enter toggles · Ctrl-S or Esc returns</Text>
    </Box>
  );
}
