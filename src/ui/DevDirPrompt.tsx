import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { resolveDir } from "../core/actions.ts";
import { latinKey } from "../core/layouts.ts";
import { DIR_KEYS, DirInput } from "./DirInput.tsx";
import { tildify } from "./format.ts";

interface Props {
  initial: string;
  width: number;
  onPick: (dir: string) => void;
  /** Shown when the saved dev directory is gone. */
  missing?: string;
}

export function DevDirPrompt({ initial, width, onPick, missing }: Props) {
  const { exit } = useApp();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<string>();
  const [cancelled, setCancelled] = useState(false);

  // Exits after the picked folder (or nothing, when cancelled) has replaced the prompt, so that is what stays on screen.
  useEffect(() => {
    if (picked || cancelled) exit();
  }, [picked, cancelled, exit]);

  useInput((input, key) => {
    if (picked || cancelled) return;
    if (key.escape || (key.ctrl && latinKey(input) === "c")) setCancelled(true);
  });

  const pick = () => {
    let dir: string;
    try {
      dir = resolveDir(value);
    } catch (e) {
      return setError((e as Error).message);
    }
    onPick(dir);
    setPicked(dir);
  };

  if (cancelled) return null;
  if (picked) return <Text dimColor>Starting ym in {tildify(picked)}…</Text>;

  return (
    <Box borderStyle="round" width={width} flexDirection="column" paddingX={1}>
      <Text bold wrap="truncate">
        Dev directory
      </Text>
      {missing && (
        <Text color="yellow" wrap="truncate">
          {tildify(missing)} no longer exists.
        </Text>
      )}
      <Text wrap="truncate">The folder that contains all your repositories.</Text>
      <Text dimColor wrap="truncate">
        Sessions start here; @tags point the agent at folders. Ctrl-S settings can change it.
      </Text>
      <Text> </Text>
      <DirInput
        value={value}
        width={Math.max(1, width - 4)}
        color="green"
        onChange={(v) => {
          setValue(v);
          setError(undefined);
        }}
        onSubmit={pick}
      />
      <Text color={error ? "red" : undefined} dimColor={!error} wrap="truncate">
        {error ?? DIR_KEYS}
      </Text>
    </Box>
  );
}

/** Asks for the dev directory; resolves to its real path, or undefined if cancelled. */
export async function askDevDir(initial: string, missing?: string): Promise<string | undefined> {
  let picked: string | undefined;
  const { columns = 80 } = process.stdout;
  const app = render(
    <DevDirPrompt
      initial={initial}
      missing={missing}
      width={Math.min(columns, 80)}
      onPick={(dir) => (picked = dir)}
    />,
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
  return picked;
}
