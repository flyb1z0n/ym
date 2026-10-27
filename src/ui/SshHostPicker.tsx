import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { describeHost, forgetHost, type SshHost } from "../ssh/hosts.ts";
import { LineInput } from "./LineInput.tsx";
import { age, fit, windowStart } from "./format.ts";

interface Props {
  hosts: SshHost[];
  width: number;
  /** Rows of hosts shown at once. */
  height: number;
  onPick: (args: string[]) => void;
  onForget: (args: string[]) => void;
}

const POINTER_WIDTH = 2;
const AGE_WIDTH = "59m ago".length;
const OPTIONS_GAP = 2;
/** Columns kept for options when the destinations would otherwise take the whole row. */
const MIN_OPTIONS_WIDTH = 12;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Hints({ hints }: { hints: [key: string, label: string][] }) {
  return (
    <Text wrap="truncate">
      {hints.map(([key, label], i) => (
        <Text key={key}>
          {i > 0 && <Text dimColor> · </Text>}
          <Text bold>{key}</Text>
          <Text dimColor> {label}</Text>
        </Text>
      ))}
    </Text>
  );
}

export function SshHostPicker({ hosts: initial, width, height, onPick, onForget }: Props) {
  const { exit } = useApp();
  const [hosts, setHosts] = useState(initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? hosts.filter((h) => h.args.join(" ").toLowerCase().includes(q)) : hosts;
  }, [hosts, query]);
  const index = Math.min(selected, Math.max(0, visible.length - 1));
  // Resolved on render: a key handler's index can be stale when keys arrive together.
  const forgetting = confirming ? visible[index] : undefined;

  // Exits after the picked host (or nothing, when cancelled) has replaced the list, so that is what stays on screen.
  useEffect(() => {
    if (picked || cancelled) exit();
  }, [picked, cancelled, exit]);
  useEffect(() => {
    if (hosts.length === 0) exit();
  }, [hosts, exit]);

  const pick = () => {
    const host = visible[index];
    if (!host) return;
    onPick(host.args);
    setPicked(host.args);
  };

  useInput((input, key) => {
    if (picked || cancelled) return;
    if (key.ctrl && input === "c") return setCancelled(true);
    if (confirming) {
      if (input === "y" && forgetting) {
        onForget(forgetting.args);
        setHosts(hosts.filter((h) => h !== forgetting));
      }
      if (input === "y" || input === "n" || key.escape) setConfirming(false);
      return;
    }
    if (key.escape) return setCancelled(true);
    if (key.downArrow) return setSelected(Math.min(index + 1, visible.length - 1));
    if (key.upArrow) return setSelected(Math.max(index - 1, 0));
    if (key.ctrl && input === "x" && visible.length > 0) setConfirming(true);
  });

  if (cancelled) return null;
  if (picked) {
    const { destination, options } = describeHost(picked);
    return (
      <Text dimColor>
        Connecting to {destination}
        {options && ` (${options})`}…
      </Text>
    );
  }
  if (hosts.length === 0) return <Text dimColor>No saved hosts left.</Text>;

  const rows = visible.map((host) => ({ host, ...describeHost(host.args) }));
  const longestOptions = Math.max(0, ...rows.map((r) => r.options.length));
  const room = width - 4 - POINTER_WIDTH - AGE_WIDTH - 1;
  const longestDestination = Math.max(1, ...rows.map((r) => r.destination.length));
  const destinationWidth = longestOptions
    ? Math.max(1, Math.min(longestDestination, room - OPTIONS_GAP - Math.min(longestOptions, MIN_OPTIONS_WIDTH)))
    : Math.max(1, room);
  const optionsWidth = longestOptions ? Math.max(0, room - destinationWidth - OPTIONS_GAP) : 0;
  const start = windowStart(visible.length, index, height);
  const count = query.trim() ? `${visible.length} of ${hosts.length}` : plural(hosts.length, "host");

  return (
    <Box borderStyle="round" width={width} flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold wrap="truncate">
          Connect to a saved host
        </Text>
        <Text dimColor>{count}</Text>
      </Box>
      <Box>
        <Text color="green">filter </Text>
        <LineInput
          value={query}
          focus={!confirming}
          placeholder="type part of a host or option"
          onChange={(v) => {
            setQuery(v);
            setSelected(0);
          }}
          onSubmit={pick}
        />
      </Box>
      <Text> </Text>
      {visible.length === 0 ? (
        <Text dimColor wrap="truncate">
          No saved hosts match "{query.trim()}".
        </Text>
      ) : (
        rows.slice(start, start + height).map(({ host, destination, options }, i) => {
          const current = start + i === index;
          return (
            <Text key={host.args.join("\0")} wrap="truncate">
              <Text color="cyan">{current ? "› " : "  "}</Text>
              <Text bold={current} color={current ? "cyan" : undefined}>
                {fit(destination, destinationWidth)}
              </Text>
              {optionsWidth > 0 && <Text dimColor>{" ".repeat(OPTIONS_GAP) + fit(options, optionsWidth)}</Text>}{" "}
              <Text dimColor>{`${age(host.lastUsed)} ago`.padStart(AGE_WIDTH)}</Text>
            </Text>
          );
        })
      )}
      <Text> </Text>
      {forgetting ? (
        <Text wrap="truncate">
          <Text color="yellow">Forget {describeHost(forgetting.args).destination}? </Text>
          <Hints hints={[["y", "forget"], ["n", "keep"]]} />
        </Text>
      ) : (
        <Hints
          hints={[
            ["↑↓", "select"],
            ["Enter", "connect"],
            ["Ctrl-X", "forget"],
            ["Esc", "cancel"],
          ]}
        />
      )}
    </Box>
  );
}

/** Lets the user pick a saved host; resolves to its ssh args, or undefined if cancelled. */
export async function pickHost(hosts: SshHost[]): Promise<string[] | undefined> {
  let picked: string[] | undefined;
  const { columns = 80, rows = 24 } = process.stdout;
  const app = render(
    <SshHostPicker
      hosts={hosts}
      width={Math.min(columns, 100)}
      height={Math.max(3, Math.min(10, rows - 8))}
      onPick={(args) => (picked = args)}
      onForget={forgetHost}
    />,
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
  return picked;
}
