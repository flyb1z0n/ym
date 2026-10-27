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

const AGE_WIDTH = 4;

export function SshHostPicker({ hosts: initial, width, height, onPick, onForget }: Props) {
  const { exit } = useApp();
  const [hosts, setHosts] = useState(initial);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<string[] | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? hosts.filter((h) => h.args.join(" ").toLowerCase().includes(q)) : hosts;
  }, [hosts, query]);
  const index = Math.min(selected, Math.max(0, visible.length - 1));

  // Exits after the picked host has replaced the list, so that line is what stays on screen.
  useEffect(() => {
    if (picked) exit();
  }, [picked, exit]);
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
    if (picked) return;
    if (key.escape || (key.ctrl && input === "c")) return exit();
    if (key.downArrow) return setSelected(Math.min(index + 1, visible.length - 1));
    if (key.upArrow) return setSelected(Math.max(index - 1, 0));
    if (key.ctrl && input === "x") {
      const host = visible[index];
      if (!host) return;
      onForget(host.args);
      setHosts(hosts.filter((h) => h !== host));
    }
  });

  if (picked) return <Text dimColor>ssh {picked.join(" ")}</Text>;

  const inner = width - 4;
  const destinationWidth = Math.min(40, Math.max(...hosts.map((h) => describeHost(h.args).destination.length)));
  const optionsWidth = Math.max(0, inner - destinationWidth - AGE_WIDTH - 2);
  const start = windowStart(visible.length, index, height);

  return (
    <Box borderStyle="round" width={width} flexDirection="column" paddingX={1}>
      <Text bold wrap="truncate">
        ym ssh <Text dimColor>({visible.length})</Text>
        <Text dimColor> · Enter connects · Ctrl-X forgets · Esc cancels</Text>
      </Text>
      <Box>
        <Text color="green">filter </Text>
        <LineInput
          value={query}
          placeholder="type to filter by host or option"
          onChange={(v) => {
            setQuery(v);
            setSelected(0);
          }}
          onSubmit={pick}
        />
      </Box>
      <Text> </Text>
      {visible.length === 0 ? (
        <Text dimColor>No saved hosts match.</Text>
      ) : (
        visible.slice(start, start + height).map((host, i) => {
          const { destination, options } = describeHost(host.args);
          return (
            <Text key={host.args.join("\0")} wrap="truncate" inverse={start + i === index}>
              {fit(destination, destinationWidth)} <Text dimColor>{fit(options, optionsWidth)}</Text>{" "}
              <Text dimColor>{age(host.lastUsed).padStart(AGE_WIDTH)}</Text>
            </Text>
          );
        })
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
      height={Math.max(3, Math.min(10, rows - 6))}
      onPick={(args) => (picked = args)}
      onForget={forgetHost}
    />,
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
  return picked;
}
