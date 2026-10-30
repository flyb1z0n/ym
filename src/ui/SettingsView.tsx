import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { AGENT_NAMES, AGENTS, nextAgent } from "../core/agents.ts";
import { namingModel } from "../core/naming.ts";
import { toggleAgent, type Settings } from "../core/settings.ts";
import type { Agent } from "../core/types.ts";
import { tildify } from "./format.ts";
import { greeting } from "./Header.tsx";

interface Props {
  settings: Settings;
  width: number;
  height: number;
  onChange: (settings: Settings) => void;
  onEditDevDir: () => void;
  onClose: () => void;
  /** Off while a dialog on top takes the keys. */
  active?: boolean;
}

interface Row {
  key: keyof Settings;
  label: string;
  describe: (s: Settings) => string;
  /** Shown value; on/off for flags. */
  value?: (s: Settings) => string;
  /** Next value; flips flags. */
  next?: (s: Settings) => Settings;
  /** Changed in the dev directory dialog instead of in place. */
  edit?: true;
  /** Heading shown above the first row of a section. */
  section?: string;
}

const agentRow = (agent: Agent): Row => ({
  key: "enabledAgents",
  section: "Agents",
  label: AGENT_NAMES[agent],
  describe: (s) => {
    if (!s.enabledAgents.includes(agent)) return "Shift-Tab skips it.";
    if (s.enabledAgents.length === 1) return "The only agent on, so the prompt doesn't show its name. Turn on another to switch.";
    return "Shift-Tab in the prompt can switch to it.";
  },
  value: (s) => (s.enabledAgents.includes(agent) ? "on" : "off"),
  next: (s) => toggleAgent(s, agent),
});

const ROWS: Row[] = [
  {
    key: "nameSessions",
    label: "Name sessions from the prompt",
    describe: (s) =>
      s.nameSessions
        ? `${namingModel()} writes a one-sentence name in the background; the prompt shows until it's ready.`
        : "Sessions are named after the first line of their prompt.",
  },
  {
    key: "callMeMain",
    label: "Call me Main instead of Master",
    describe: (s) => `The header says "${greeting(s)}"`,
  },
  {
    key: "defaultAgent",
    section: "Agents",
    label: "Default agent",
    describe: (s) =>
      s.enabledAgents.length === 1
        ? `New prompts start on ${AGENT_NAMES[s.defaultAgent]}, the only agent on.`
        : `New prompts start on ${AGENT_NAMES[s.defaultAgent]}; Shift-Tab in the prompt switches the agent for one session.`,
    value: (s) => AGENT_NAMES[s.defaultAgent],
    next: (s) => ({ ...s, defaultAgent: nextAgent(s.defaultAgent, s.enabledAgents) }),
  },
  ...AGENTS.map(agentRow),
  {
    key: "cursorAutoRun",
    section: "Cursor",
    label: "Auto-run commands",
    describe: (s) =>
      s.cursorAutoRun
        ? "Cursor runs commands without asking (--force) unless they're explicitly denied."
        : "Cursor asks before running commands.",
  },
  {
    key: "contextByDefault",
    section: "Context mode",
    label: "Start prompts in context mode",
    describe: (s) => {
      if (!s.contextByDefault) return "New prompts open their @folders as workspaces; Ctrl-F switches one prompt to context mode.";
      return s.devDir
        ? "New prompts start in context mode; Ctrl-F switches one prompt back to opening its @folders."
        : "Applies once the dev directory is set.";
    },
  },
  {
    key: "devDir",
    section: "Context mode",
    label: "Dev directory",
    describe: (s) =>
      s.devDir
        ? "Context sessions start here; their @tags only point the agent at folders."
        : "The folder that contains all your repositories. Ctrl-F asks for it the first time.",
    value: (s) => (s.devDir ? tildify(s.devDir) : "not set"),
    edit: true,
  },
];

const shown = (row: Row, s: Settings) => row.value?.(s) ?? (s[row.key] ? "on" : "off");
const advance = (row: Row, s: Settings): Settings => row.next?.(s) ?? { ...s, [row.key]: !s[row.key] };

export function SettingsView({ settings, width, height, onChange, onEditDevDir, onClose, active = true }: Props) {
  const [selected, setSelected] = useState(0);
  const label = Math.max(...ROWS.map((r) => r.label.length));
  const valueWidth = Math.max(3, ...ROWS.map((r) => shown(r, settings).length));

  useInput(
    (input, key) => {
      if (key.escape || (key.ctrl && input === "s")) return onClose();
      if (key.upArrow) return setSelected((i) => Math.max(0, i - 1));
      if (key.downArrow) return setSelected((i) => Math.min(ROWS.length - 1, i + 1));
      if (!key.return && input !== " ") return;
      const row = ROWS[selected]!;
      if (row.edit) onEditDevDir();
      else onChange(advance(row, settings));
    },
    { isActive: active },
  );

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1}>
      <Text bold color="green">
        ym settings
      </Text>
      <Text dimColor>Changes are saved immediately.</Text>
      {ROWS.map((row, i) => (
        <Box key={`${row.section ?? ""}/${row.label}`} flexDirection="column" marginTop={1}>
          {row.section && row.section !== ROWS[i - 1]?.section && (
            <Box marginBottom={1}>
              <Text bold>{row.section}</Text>
            </Box>
          )}
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
