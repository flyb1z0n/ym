import { existsSync } from "node:fs";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  importChat,
  removeSession,
  renameSession,
  resumeSession,
  setHighlightColor,
  startSession,
  stopSession,
  toggleArchive,
} from "../core/actions.ts";
import type { HighlightColor } from "../core/types.ts";
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
import { attachPastedImages, referencedImages, stripImageMarkers } from "../core/images.ts";
import { scanChats, type CursorChat } from "../core/importer.ts";
import { isGitRepo } from "../core/naming.ts";
import { loadSettings, saveSettings } from "../core/settings.ts";
import { isAlive } from "../core/status.ts";
import { detachClient, focusRight, listAgentPanes, show, unshow } from "../core/tmux.ts";
import { Header, HEADER_HEIGHT } from "./Header.tsx";
import { tildify } from "./format.ts";
import { ConfirmDialog, HighlightDialog, RenameDialog } from "./Dialog.tsx";
import { ImportPicker } from "./ImportPicker.tsx";
import { LineInput } from "./LineInput.tsx";
import { inputLineCount, promptHighlights } from "./promptText.ts";
import { SessionList } from "./SessionList.tsx";
import { SettingsView } from "./SettingsView.tsx";
import { useDashboard } from "./useDashboard.ts";

type ConfirmAction = "stop" | "archive" | "unarchive" | "delete";

type Mode =
  | { kind: "main" }
  | { kind: "rename"; id: string; text: string }
  | { kind: "highlight"; id: string; color: HighlightColor | undefined }
  | { kind: "confirm"; id: string; action: ConfirmAction }
  | { kind: "import"; chats: CursorChat[] }
  | { kind: "settings" };

type Flash = { text: string; error?: boolean } | undefined;

const KEYS =
  "⏎ open · ↑↓ select · @ folder · ^S settings · ^R rename · ^L highlight · ^X stop · ^A archive · ^D delete · ^O import · ^G back here";
const FOLDER_REFRESH_MS = 30_000;
const MAX_INPUT_LINES = 8;
const MIN_LIST_HEIGHT = 3;
/** Accent bar, its padding, and a spare last column so lines never hit the terminal edge. */
const INPUT_CHROME = 3;
const INPUT_BAR = {
  topLeft: "",
  top: "",
  topRight: "",
  right: "",
  bottomRight: "",
  bottom: "",
  bottomLeft: "",
  left: "▌",
};

const linesFor = (text: string, width: number) => Math.max(1, Math.ceil(text.length / Math.max(1, width)));

export function App({ hooksInstalled }: { hooksInstalled: boolean }) {
  const { exit } = useApp();
  const { columns, rows: termRows } = useWindowSize();
  const { rows, panes, refresh } = useDashboard();
  const [tab, setTab] = useState<TabId>("sessions");
  const [group, setGroup] = useState<GroupMode>("status");
  const [selectedId, setSelectedId] = useState<string>();
  const [mode, setMode] = useState<Mode>({ kind: "main" });
  const [flash, setFlash] = useState<Flash>(
    hooksInstalled ? undefined : { text: "Status tracking is off: run `ym install`, then restart agents.", error: true },
  );
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState(0);
  const [dismissed, setDismissed] = useState<string>();
  const [lastCwd, setLastCwd] = useState(process.cwd());
  const [externalFolders, setExternalFolders] = useState<string[]>([]);
  const [settings, setSettings] = useState(loadSettings);
  const [switchingSession, setSwitchingSession] = useState(false);
  const previousSelection = useRef<string | undefined>(undefined);

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
  const attempt = (fn: () => void): boolean => {
    try {
      fn();
      refresh();
      return true;
    } catch (e) {
      say((e as Error).message, true);
      refresh();
      return false;
    }
  };

  // Keep the selected session's live pane on the right side of the window.
  // For brand new sessions, wait until chatId is attached before showing the pane,
  // so the preview doesn't flash Cursor's transient startup state.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (mode.kind === "settings") unshow();
        else if (currentPane && current?.session.chatId) show(currentPane.paneId);
        else unshow();
      } catch (e) {
        say((e as Error).message, true);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [currentPane?.paneId, current?.session.chatId, mode.kind]);

  useEffect(() => {
    const currentId = current?.session.id;
    const previousId = previousSelection.current;
    previousSelection.current = currentId;
    if (!previousId || !currentId || previousId === currentId) return;
    setSwitchingSession(true);
    const timer = setTimeout(() => setSwitchingSession(false), 180);
    return () => clearTimeout(timer);
  }, [current?.session.id]);

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
    const input = { prompt: parsed.prompt, folders, images };
    setText("");
    setImages([]);
    const naming =
      settings.useWorktrees && settings.nameWorktrees && !!stripImageMarkers(input.prompt) && isGitRepo(folders[0]!);
    const attached = referencedImages(input.prompt, images).length;
    const withImages = attached ? ` with ${attached} image${attached === 1 ? "" : "s"}` : "";
    say(
      `${naming ? "Naming the worktree and starting" : "Starting"} Cursor in ${folders.map(tildify).join(" + ")}${withImages}…`,
    );
    startSession(input, (s) => {
      setLastCwd(s.cwd);
      setTab("sessions");
      setSelectedId(s.id);
      refresh();
    })
      .then((s) => say(`Started ${s.name}${s.worktree ? ` in worktree ${s.worktree}` : ""}. Press Enter to open it.`))
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
        if (text) {
          setImages([]);
          return setText("");
        }
        if (process.env.TMUX) return detachClient();
        return exit();
      }
      if (input === "o") {
        const tracked = new Set(rows.map((r) => r.session.chatId));
        return setMode({ kind: "import", chats: scanChats().filter((c) => !tracked.has(c.chatId)) });
      }
      if (input === "s") return setMode({ kind: "settings" });
      if (!current) return;
      const { session } = current;
      if (input === "r") return setMode({ kind: "rename", id: session.id, text: session.name });
      if (input === "l") return setMode({ kind: "highlight", id: session.id, color: session.highlightColor });
      if (input === "x") {
        if (!isAlive(currentPane)) return say("Session isn't running.");
        return setMode({ kind: "confirm", id: session.id, action: "stop" });
      }
      if (input === "a") {
        return setMode({
          kind: "confirm",
          id: session.id,
          action: session.archivedAt === undefined ? "archive" : "unarchive",
        });
      }
      if (input === "d") return setMode({ kind: "confirm", id: session.id, action: "delete" });
    },
    { isActive: mode.kind === "main" },
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

  if (mode.kind === "settings") {
    return (
      <SettingsView
        settings={settings}
        width={columns}
        height={termRows}
        onChange={(next) => {
          try {
            saveSettings(next);
            setSettings(next);
          } catch (e) {
            say((e as Error).message, true);
          }
        }}
        onClose={() => setMode({ kind: "main" })}
      />
    );
  }

  const target = errors.length
    ? errors.join(", ")
    : suggestions.length
      ? "↑↓ choose a folder · Tab or Enter picks it · Esc hides suggestions"
    : `in ${folders.map(tildify).join(" + ")}${parsed.folders.length ? "" : "  (tag folders with @)"}`;
  const inputWidth = Math.max(1, columns - INPUT_CHROME);
  const fixedLines = HEADER_HEIGHT + suggestions.length + 1 + 1 + linesFor(KEYS, columns);
  const maxInputLines = Math.max(1, Math.min(MAX_INPUT_LINES, termRows - fixedLines - MIN_LIST_HEIGHT));
  const inputLines = Math.min(maxInputLines, inputLineCount(text, inputWidth));
  const listHeight = Math.max(MIN_LIST_HEIGHT, termRows - fixedLines - inputLines);
  const modalOpen = mode.kind === "rename" || mode.kind === "confirm" || mode.kind === "highlight";
  const inputDimmed = modalOpen || switchingSession;
  const modalTarget =
    mode.kind === "rename" || mode.kind === "confirm" || mode.kind === "highlight"
      ? rows.find((row) => row.session.id === mode.id)?.session
      : undefined;

  const confirmCopy = (action: ConfirmAction) => {
    switch (action) {
      case "stop":
        return {
          title: "Stop session?",
          message: "You can resume it later.",
          confirmLabel: "Stop",
          tone: "warning" as const,
        };
      case "archive":
        return {
          title: "Archive session?",
          message: "It moves to the Archived tab.",
          confirmLabel: "Archive",
          tone: "warning" as const,
        };
      case "unarchive":
        return {
          title: "Unarchive session?",
          message: "It moves back to the Sessions tab.",
          confirmLabel: "Unarchive",
          tone: "warning" as const,
        };
      case "delete":
        return {
          title: "Delete session?",
          confirmLabel: "Delete",
          tone: "danger" as const,
        };
    }
  };

  const runConfirmedAction = () => {
    if (mode.kind !== "confirm") return;
    if (!modalTarget) {
      setMode({ kind: "main" });
      return say("That session no longer exists.", true);
    }
    const { action } = mode;
    const succeeded = attempt(() => {
      if (action === "stop") {
        stopSession(panes.get(modalTarget.id));
        say(`Stopped ${modalTarget.name}. Press Enter to resume it.`);
      } else if (action === "delete") {
        removeSession(modalTarget, panes.get(modalTarget.id));
        setFlash(undefined);
      } else {
        const next = toggleArchive(modalTarget);
        say(next.archivedAt ? `Archived ${modalTarget.name}.` : `Unarchived ${modalTarget.name}.`);
      }
    });
    if (succeeded) setMode({ kind: "main" });
  };

  return (
    <Box flexDirection="column" height={termRows}>
      <Header folder={lastCwd} rows={rows} tab={tab} counts={counts} group={group} dimmed={modalOpen} />
      <SessionList
        groups={groups}
        mode={group}
        selectedId={current?.session.id}
        width={columns}
        height={listHeight}
        tab={tab}
        dimmed={modalOpen}
      />
      {suggestions.map((path, i) => (
        <Text key={path} inverse={i === suggestionIndex} color="cyan" dimColor={modalOpen} wrap="truncate">
          {`  @${tildify(path)}`}
        </Text>
      ))}
      <Text color={flash?.error ? "red" : "green"} dimColor={inputDimmed} wrap="truncate">
        {flash?.text ?? " "}
      </Text>
      <Box
        borderStyle={INPUT_BAR}
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderColor="green"
        borderDimColor={inputDimmed}
        paddingLeft={1}
        width={columns}
      >
        <LineInput
          value={text}
          width={inputWidth}
          maxLines={maxInputLines}
          highlights={promptHighlights}
          placeholder="Ask Cursor… @folder to choose where, drop images to attach (Enter on empty opens the selected session)"
          focus={mode.kind === "main" && !switchingSession}
          onChange={(v) => {
            setText(v);
            if (!v) setImages([]);
            setSuggestion(0);
          }}
          transformPaste={(pasted) => {
            const attached = attachPastedImages(pasted, images);
            setImages(attached.images);
            return attached.text;
          }}
          onSubmit={submit}
        />
      </Box>
      <Text color={errors.length ? "red" : undefined} dimColor={modalOpen || !errors.length} wrap="truncate">
        {target}
      </Text>
      <Text dimColor={modalOpen || undefined}>{KEYS}</Text>
      {mode.kind === "rename" ? (
        <RenameDialog
          value={mode.text}
          width={columns}
          height={termRows}
          onChange={(value) => setMode({ ...mode, text: value })}
          onSave={() => {
            if (!modalTarget) {
              setMode({ kind: "main" });
              return say("That session no longer exists.", true);
            }
            if (attempt(() => renameSession(modalTarget, mode.text))) setMode({ kind: "main" });
          }}
          onCancel={() => setMode({ kind: "main" })}
        />
      ) : null}
      {mode.kind === "confirm" ? (
        <ConfirmDialog
          {...confirmCopy(mode.action)}
          subject={modalTarget?.name ?? "Session no longer exists"}
          width={columns}
          height={termRows}
          onConfirm={runConfirmedAction}
          onCancel={() => setMode({ kind: "main" })}
        />
      ) : null}
      {mode.kind === "highlight" ? (
        <HighlightDialog
          value={mode.color}
          width={columns}
          height={termRows}
          onSave={(color) => {
            if (!modalTarget) {
              setMode({ kind: "main" });
              return say("That session no longer exists.", true);
            }
            if (attempt(() => setHighlightColor(modalTarget, color))) {
              say(color ? `Updated highlight for ${modalTarget.name}.` : `Cleared highlight for ${modalTarget.name}.`);
              setMode({ kind: "main" });
            }
          }}
          onCancel={() => setMode({ kind: "main" })}
        />
      ) : null}
    </Box>
  );
}
