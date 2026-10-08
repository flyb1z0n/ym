import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { LineInput } from "./LineInput.tsx";
import { useEffect, useMemo, useState } from "react";
import {
  importChat,
  removeSession,
  renameSession,
  resumeSession,
  startSession,
  stopSession,
  toggleArchive,
  type NewSessionInput,
} from "../core/actions.ts";
import { filterRows, TABS, tabCounts, type TabId } from "../core/filter.ts";
import { scanChats, type CursorChat } from "../core/importer.ts";
import { isAlive } from "../core/status.ts";
import { capturePane, DASH_KEY, detachClient, selectWindow, sendLine } from "../core/tmux.ts";
import { FilterTabs } from "./FilterTabs.tsx";
import { ImportPicker } from "./ImportPicker.tsx";
import { NewSessionForm } from "./NewSessionForm.tsx";
import { Preview } from "./Preview.tsx";
import { SessionList } from "./SessionList.tsx";
import { useDashboard } from "./useDashboard.ts";

type Mode =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "reply"; id: string; text: string }
  | { kind: "rename"; id: string; text: string }
  | { kind: "confirmDelete"; id: string }
  | { kind: "import"; chats: CursorChat[] };

type Flash = { text: string; error?: boolean } | undefined;

const HINTS =
  "⏎ jump  n new  r reply  e rename  x stop  a archive  d delete  i import  1-7/Tab filter  q detach";

export function App({ hooksInstalled }: { hooksInstalled: boolean }) {
  const { exit } = useApp();
  const { columns, rows: termRows } = useWindowSize();
  const { rows, windows, refresh } = useDashboard();
  const [tab, setTab] = useState<TabId>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [flash, setFlash] = useState<Flash>(
    hooksInstalled ? undefined : { text: "Status tracking is off: run `ym install`, then restart agents.", error: true },
  );
  const [preview, setPreview] = useState("");
  const [lastCwd, setLastCwd] = useState(process.cwd());

  const visible = useMemo(() => filterRows(rows, tab), [rows, tab]);
  const counts = useMemo(() => tabCounts(rows), [rows]);
  const foundIndex = visible.findIndex((r) => r.session.id === selectedId);
  const index = foundIndex === -1 ? 0 : foundIndex;
  const current = visible[index];

  useEffect(() => {
    setPreview(current && windows.has(current.session.id) ? capturePane(current.session.id) : "");
  }, [current?.session.id, rows, windows]);

  const say = (text: string, error = false) => setFlash({ text, error });
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      say((e as Error).message, true);
    }
    refresh();
  };

  const select = (i: number) => setSelectedId(visible[Math.max(0, Math.min(i, visible.length - 1))]?.session.id);

  const jump = () => {
    if (!current) return;
    const { session } = current;
    attempt(() => {
      if (!isAlive(windows.get(session.id))) resumeSession(session);
      selectWindow(session.id);
      setFlash(undefined);
    });
  };

  const create = (input: NewSessionInput) => {
    setMode({ kind: "list" });
    say("Starting session…");
    startSession(input)
      .then((s) => {
        setLastCwd(input.cwd);
        setTab("all");
        setSelectedId(s.id);
        say(`Started ${s.name}. Press Enter to jump in.`);
      })
      .catch((e: Error) => say(e.message, true))
      .finally(refresh);
  };

  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") return select(index - 1);
      if (key.downArrow || input === "j") return select(index + 1);
      if (key.tab) {
        const i = TABS.findIndex((t) => t.id === tab);
        return setTab(TABS[(i + (key.shift ? TABS.length - 1 : 1)) % TABS.length]!.id);
      }
      const n = Number(input);
      if (n >= 1 && n <= TABS.length) return setTab(TABS[n - 1]!.id);
      if (key.return) return jump();
      if (input === "n") return setMode({ kind: "new" });
      if (input === "i") {
        const tracked = new Set(rows.map((r) => r.session.chatId));
        return setMode({ kind: "import", chats: scanChats().filter((c) => !tracked.has(c.chatId)) });
      }
      if (input === "q" || (key.ctrl && input === "c")) {
        if (process.env.TMUX) return detachClient();
        return exit();
      }
      if (!current) return;
      const { session, status } = current;
      const alive = isAlive(windows.get(session.id));
      if (input === "r") {
        if (alive && status === "your_turn") return setMode({ kind: "reply", id: session.id, text: "" });
        return say("Replies work when it's the session's turn. Press Enter to jump in instead.");
      }
      if (input === "e") return setMode({ kind: "rename", id: session.id, text: session.name });
      if (input === "x") {
        if (!alive) return say("Session isn't running.");
        return attempt(() => {
          stopSession(session);
          say(`Stopped ${session.name}. Press Enter to resume it.`);
        });
      }
      if (input === "a") {
        return attempt(() => {
          const next = toggleArchive(session);
          say(next.archivedAt ? `Archived ${session.name}.` : `Unarchived ${session.name}.`);
        });
      }
      if (input === "d") return setMode({ kind: "confirmDelete", id: session.id });
    },
    { isActive: mode.kind === "list" },
  );

  useInput(
    (input, key) => {
      if (mode.kind !== "confirmDelete") return;
      const target = rows.find((r) => r.session.id === mode.id)?.session;
      if (input === "y" && target) {
        attempt(() => {
          removeSession(target);
          say(`Deleted ${target.name}. The Cursor chat is untouched.`);
        });
      }
      if (input === "y" || input === "n" || key.escape) setMode({ kind: "list" });
    },
    { isActive: mode.kind === "confirmDelete" },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setMode({ kind: "list" });
    },
    { isActive: mode.kind === "reply" || mode.kind === "rename" },
  );

  const bodyHeight = Math.max(6, termRows - 3);
  const listWidth = Math.max(40, Math.min(90, Math.floor(columns * 0.5)));
  const sideWidth = Math.max(20, columns - listWidth);

  if (mode.kind === "import") {
    return (
      <Box flexDirection="column" height={termRows}>
        <FilterTabs active={tab} counts={counts} />
        <ImportPicker
          chats={mode.chats}
          width={columns}
          height={termRows - 1}
          onClose={() => setMode({ kind: "list" })}
          onImport={(chat) => {
            const s = importChat(chat);
            setMode({ ...mode, chats: mode.chats.filter((c) => c.chatId !== chat.chatId) });
            setSelectedId(s.id);
            say(`Imported ${s.name}.`);
            refresh();
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termRows}>
      <FilterTabs active={tab} counts={counts} />
      <Box height={bodyHeight}>
        <SessionList rows={visible} selected={index} width={listWidth} height={bodyHeight} tab={tab} />
        {mode.kind === "new" ? (
          <NewSessionForm
            defaultCwd={lastCwd}
            width={sideWidth}
            height={bodyHeight}
            onSubmit={create}
            onCancel={() => setMode({ kind: "list" })}
          />
        ) : (
          <Preview row={current} content={preview} width={sideWidth} height={bodyHeight} />
        )}
      </Box>
      <Footer
        mode={mode}
        flash={flash}
        onChange={(text) => (mode.kind === "reply" || mode.kind === "rename") && setMode({ ...mode, text })}
        onSubmit={() => {
          const target = rows.find((r) => "id" in mode && r.session.id === mode.id)?.session;
          if (target && mode.kind === "reply" && mode.text.trim()) {
            attempt(() => {
              sendLine(target.id, mode.text);
              say(`Sent to ${target.name}.`);
            });
          }
          if (target && mode.kind === "rename") attempt(() => renameSession(target, mode.text));
          setMode({ kind: "list" });
        }}
      />
    </Box>
  );
}

function Footer({
  mode,
  flash,
  onChange,
  onSubmit,
}: {
  mode: Mode;
  flash: Flash;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  let line = <Text dimColor wrap="truncate">{`${HINTS}   ${DASH_KEY()} returns here`}</Text>;
  if (mode.kind === "reply" || mode.kind === "rename") {
    line = (
      <Box>
        <Text color="green">{mode.kind === "reply" ? "reply › " : "rename › "}</Text>
        <LineInput value={mode.text} onChange={onChange} onSubmit={onSubmit} />
        <Text dimColor>{"   Enter sends · Esc cancels"}</Text>
      </Box>
    );
  } else if (mode.kind === "confirmDelete") {
    line = <Text color="yellow">Delete this session from ym? The Cursor chat is kept. (y/n)</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text color={flash?.error ? "red" : "green"} wrap="truncate">
        {flash?.text ?? " "}
      </Text>
      {line}
    </Box>
  );
}
