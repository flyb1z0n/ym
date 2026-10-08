import { existsSync } from "node:fs";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useState } from "react";
import {
  importChat,
  removeSession,
  renameSession,
  resumeSession,
  startSession,
  stopSession,
  toggleArchive,
} from "../core/actions.ts";
import { defaultModelName } from "../core/cursor.ts";
import {
  filterRows,
  flattenGroups,
  GROUP_MODES,
  groupRows,
  TABS,
  tabCounts,
  type GroupMode,
  type TabId,
} from "../core/filter.ts";
import { buildFolderIndex, parsePrompt, rootFolders, suggestFolders, trailingTag } from "../core/folders.ts";
import { scanChats, type CursorChat } from "../core/importer.ts";
import { isAlive } from "../core/status.ts";
import { detachClient, focusRight, listAgentPanes, show, unshow } from "../core/tmux.ts";
import { Header, HEADER_HEIGHT } from "./Header.tsx";
import { tildify } from "./format.ts";
import { ImportPicker } from "./ImportPicker.tsx";
import { LineInput } from "./LineInput.tsx";
import { SessionList } from "./SessionList.tsx";
import { useDashboard } from "./useDashboard.ts";

type Mode =
  | { kind: "main" }
  | { kind: "rename"; id: string; text: string }
  | { kind: "confirmDelete"; id: string }
  | { kind: "import"; chats: CursorChat[] };

type Flash = { text: string; error?: boolean } | undefined;

const KEYS = "⏎ open · ↑↓ select · @ folder · ^R rename · ^X stop · ^T archive · ^D delete · ^O import · ^G back here";
const FOLDER_REFRESH_MS = 30_000;

const linesFor = (text: string, width: number) => Math.max(1, Math.ceil(text.length / Math.max(1, width)));

export function App({ hooksInstalled }: { hooksInstalled: boolean }) {
  const { exit } = useApp();
  const { columns, rows: termRows } = useWindowSize();
  const { rows, panes, refresh } = useDashboard();
  const [tab, setTab] = useState<TabId>("sessions");
  const [group, setGroup] = useState<GroupMode>("status");
  const [model] = useState(defaultModelName);
  const [selectedId, setSelectedId] = useState<string>();
  const [mode, setMode] = useState<Mode>({ kind: "main" });
  const [flash, setFlash] = useState<Flash>(
    hooksInstalled ? undefined : { text: "Status tracking is off: run `ym install`, then restart agents.", error: true },
  );
  const [text, setText] = useState("");
  const [suggestion, setSuggestion] = useState(0);
  const [dismissed, setDismissed] = useState<string>();
  const [lastCwd, setLastCwd] = useState(process.cwd());
  const [externalFolders, setExternalFolders] = useState<string[]>([]);

  const groups = useMemo(() => groupRows(filterRows(rows, tab), group), [rows, tab, group]);
  const visible = useMemo(() => flattenGroups(groups), [groups]);
  const counts = useMemo(() => tabCounts(rows), [rows]);
  const foundIndex = visible.findIndex((r) => r.session.id === selectedId);
  const index = foundIndex === -1 ? 0 : foundIndex;
  const current = visible[index];
  const currentPane = current ? panes.get(current.session.id) : undefined;

  useEffect(() => {
    const load = () =>
      setExternalFolders(buildFolderIndex(scanChats().map((c) => c.cwd), rootFolders()).filter((p) => existsSync(p)));
    load();
    const timer = setInterval(load, FOLDER_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const folderIndex = useMemo(() => {
    const recent = [...rows].sort((a, b) => b.lastActivity - a.lastActivity).flatMap((r) => [r.session.cwd, ...(r.session.addDirs ?? [])]);
    return buildFolderIndex(recent, externalFolders);
  }, [rows, externalFolders]);

  const tag = trailingTag(text);
  const suggestions = tag && dismissed !== text ? suggestFolders(tag.query, folderIndex) : [];
  const suggestionIndex = Math.min(suggestion, Math.max(0, suggestions.length - 1));
  const parsed = useMemo(() => parsePrompt(text, folderIndex), [text, folderIndex]);
  const folders = parsed.folders.length ? parsed.folders : [lastCwd];
  // The tag still being typed isn't an error while suggestions are offered for it.
  const errors = suggestions.length && tag ? parsed.errors.filter((e) => e !== `Unknown folder @${tag.query}`) : parsed.errors;

  const say = (message: string, error = false) => setFlash({ text: message, error });
  const attempt = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      say((e as Error).message, true);
    }
    refresh();
  };

  // Keep the selected session's live pane on the right side of the window.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (currentPane) show(currentPane.paneId);
        else unshow();
      } catch (e) {
        say((e as Error).message, true);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [currentPane?.paneId]);

  const select = (i: number) => setSelectedId(visible[Math.max(0, Math.min(i, visible.length - 1))]?.session.id);

  const acceptSuggestion = () => {
    const path = suggestions[suggestionIndex];
    if (!tag || !path) return;
    setText(`${text.slice(0, tag.start)}@${tildify(path)} `);
    setSuggestion(0);
  };

  const openCurrent = () => {
    if (!current) return;
    const { session } = current;
    attempt(() => {
      if (!isAlive(currentPane)) resumeSession(session, currentPane);
      const pane = listAgentPanes().get(session.id);
      if (pane) show(pane.paneId);
      focusRight();
      setFlash(undefined);
    });
  };

  const launch = () => {
    if (errors.length) return say(errors.join(", "), true);
    const input = { prompt: parsed.prompt, folders };
    setText("");
    say(`Starting Cursor in ${folders.map(tildify).join(" + ")}…`);
    startSession(input)
      .then((s) => {
        setLastCwd(s.cwd);
        setTab("sessions");
        setSelectedId(s.id);
        say(`Started ${s.name}. Press Enter to open it.`);
      })
      .catch((e: Error) => say(e.message, true))
      .finally(refresh);
  };

  const submit = () => {
    if (suggestions.length) return acceptSuggestion();
    if (text.trim()) return launch();
    openCurrent();
  };

  useInput(
    (input, key) => {
      if (key.upArrow) return suggestions.length ? setSuggestion(Math.max(0, suggestionIndex - 1)) : select(index - 1);
      if (key.downArrow) {
        return suggestions.length ? setSuggestion(Math.min(suggestions.length - 1, suggestionIndex + 1)) : select(index + 1);
      }
      if (key.tab) {
        if (key.shift) {
          const i = GROUP_MODES.findIndex((m) => m.id === group);
          return setGroup(GROUP_MODES[(i + 1) % GROUP_MODES.length]!.id);
        }
        if (suggestions.length) return acceptSuggestion();
        const i = TABS.findIndex((t) => t.id === tab);
        return setTab(TABS[(i + 1) % TABS.length]!.id);
      }
      if (key.escape) return setDismissed(text);
      if (!key.ctrl) return;
      if (input === "c") {
        if (text) return setText("");
        if (process.env.TMUX) return detachClient();
        return exit();
      }
      if (input === "o") {
        const tracked = new Set(rows.map((r) => r.session.chatId));
        return setMode({ kind: "import", chats: scanChats().filter((c) => !tracked.has(c.chatId)) });
      }
      if (!current) return;
      const { session } = current;
      if (input === "r") return setMode({ kind: "rename", id: session.id, text: session.name });
      if (input === "x") {
        if (!isAlive(currentPane)) return say("Session isn't running.");
        return attempt(() => {
          stopSession(currentPane);
          say(`Stopped ${session.name}. Press Enter to resume it.`);
        });
      }
      if (input === "t") {
        return attempt(() => {
          const next = toggleArchive(session);
          say(next.archivedAt ? `Archived ${session.name}.` : `Unarchived ${session.name}.`);
        });
      }
      if (input === "d") return setMode({ kind: "confirmDelete", id: session.id });
    },
    { isActive: mode.kind === "main" },
  );

  useInput(
    (input, key) => {
      if (mode.kind !== "confirmDelete") return;
      const target = rows.find((r) => r.session.id === mode.id)?.session;
      if (input === "y" && target) {
        attempt(() => {
          removeSession(target, panes.get(target.id));
          say(`Deleted ${target.name}. The Cursor chat is untouched.`);
        });
      }
      if (input === "y" || input === "n" || key.escape) setMode({ kind: "main" });
    },
    { isActive: mode.kind === "confirmDelete" },
  );

  useInput(
    (_input, key) => {
      if (key.escape) setMode({ kind: "main" });
    },
    { isActive: mode.kind === "rename" },
  );

  if (mode.kind === "import") {
    return (
      <ImportPicker
        chats={mode.chats}
        width={columns}
        height={termRows}
        onClose={() => setMode({ kind: "main" })}
        onImport={(chat) => {
          const s = importChat(chat);
          setMode({ ...mode, chats: mode.chats.filter((c) => c.chatId !== chat.chatId) });
          setSelectedId(s.id);
          say(`Imported ${s.name}.`);
          refresh();
        }}
      />
    );
  }

  const target = errors.length
    ? errors.join(", ")
    : suggestions.length
      ? "↑↓ choose a folder · Tab or Enter picks it · Esc hides suggestions"
    : `in ${folders.map(tildify).join(" + ")}${parsed.folders.length ? "" : "  (tag folders with @)"}`;
  const fixedLines =
    HEADER_HEIGHT + suggestions.length + 1 + 3 + 1 + linesFor(KEYS, columns);
  const listHeight = Math.max(3, termRows - fixedLines);

  return (
    <Box flexDirection="column" height={termRows}>
      <Header model={model} folder={lastCwd} rows={rows} tab={tab} counts={counts} group={group} />
      <SessionList
        groups={groups}
        mode={group}
        selectedId={current?.session.id}
        width={columns}
        height={listHeight}
        tab={tab}
      />
      {suggestions.map((path, i) => (
        <Text key={path} inverse={i === suggestionIndex} color="cyan" wrap="truncate">
          {`  @${tildify(path)}`}
        </Text>
      ))}
      <Text color={flash?.error ? "red" : "green"} wrap="truncate">
        {flash?.text ?? " "}
      </Text>
      <Box borderStyle="round" borderColor={mode.kind === "main" ? "green" : "yellow"} paddingX={1} width={columns}>
        {mode.kind === "main" ? (
          <>
            <Box marginRight={1}>
              <Text color="green">›</Text>
            </Box>
            <LineInput
              value={text}
              width={columns - 7}
              placeholder="Ask Cursor… @folder to choose where (Enter on empty opens the selected session)"
              onChange={(v) => {
                setText(v);
                setSuggestion(0);
              }}
              onSubmit={submit}
            />
          </>
        ) : mode.kind === "rename" ? (
          <>
            <Box marginRight={1}>
              <Text color="yellow">rename ›</Text>
            </Box>
            <LineInput
              value={mode.text}
              width={columns - 14}
              onChange={(v) => setMode({ ...mode, text: v })}
              onSubmit={() => {
                const s = rows.find((r) => r.session.id === mode.id)?.session;
                if (s) attempt(() => renameSession(s, mode.text));
                setMode({ kind: "main" });
              }}
            />
          </>
        ) : (
          <Text color="yellow">Delete this session from ym? The Cursor chat is kept. (y/n)</Text>
        )}
      </Box>
      <Text color={errors.length ? "red" : undefined} dimColor={!errors.length} wrap="truncate">
        {mode.kind === "main" ? target : "Enter saves · Esc cancels"}
      </Text>
      <Text dimColor>{KEYS}</Text>
    </Box>
  );
}
