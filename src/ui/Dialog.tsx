import { Box, Text, useInput } from "ink";
import type { ReactNode } from "react";
import { useState } from "react";
import type { HighlightColor } from "../core/types.ts";
import { LineInput } from "./LineInput.tsx";

type Tone = "warning" | "danger";
type Choice = "confirm" | "cancel";

interface FrameProps {
  title: string;
  width: number;
  height: number;
  tone?: Tone;
  rows: number;
  children: ReactNode;
}

interface ConfirmProps {
  title: string;
  message: string;
  subject: string;
  confirmLabel: string;
  width: number;
  height: number;
  tone?: Tone;
  onConfirm: () => void;
  onCancel: () => void;
}

interface RenameProps {
  value: string;
  width: number;
  height: number;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

interface HighlightDialogProps {
  value: HighlightColor | undefined;
  width: number;
  height: number;
  onSave: (value: HighlightColor | undefined) => void;
  onCancel: () => void;
}

const HIGHLIGHT_OPTIONS: Array<{ id: HighlightColor | undefined; label: string; color?: HighlightColor }> = [
  { id: undefined, label: "None" },
  { id: "yellow", label: "Yellow", color: "yellow" },
  { id: "green", label: "Green", color: "green" },
  { id: "cyan", label: "Cyan", color: "cyan" },
  { id: "blue", label: "Blue", color: "blue" },
  { id: "magenta", label: "Magenta", color: "magenta" },
  { id: "red", label: "Red", color: "red" },
];

export function dialogBounds(termWidth: number, termHeight: number, requestedHeight: number) {
  const width = Math.min(64, Math.max(1, termWidth - 2));
  const height = Math.min(requestedHeight, Math.max(1, termHeight - 2));
  return {
    width,
    height,
    left: Math.max(0, Math.floor((termWidth - width) / 2)),
    top: Math.max(0, Math.floor((termHeight - height) / 2)),
  };
}

function DialogFrame({ title, width: termWidth, height: termHeight, tone = "warning", rows, children }: FrameProps) {
  const bounds = dialogBounds(termWidth, termHeight, rows + 3);
  const color = tone === "danger" ? "red" : "yellow";

  return (
    <Box
      position="absolute"
      left={bounds.left}
      top={bounds.top}
      width={bounds.width}
      height={bounds.height}
      borderStyle="round"
      borderColor={color}
      backgroundColor="black"
      paddingX={1}
      flexDirection="column"
      overflow="hidden"
    >
      <Text bold color={color} wrap="truncate">
        {title}
      </Text>
      {children}
    </Box>
  );
}

export function ConfirmDialog({
  title,
  message,
  subject,
  confirmLabel,
  width,
  height,
  tone,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const [choice, setChoice] = useState<Choice>("cancel");

  useInput((input, key) => {
    if (key.escape || input === "n") return onCancel();
    if (input === "y") return onConfirm();
    if (key.leftArrow || key.rightArrow || key.tab) {
      return setChoice((current) => (current === "confirm" ? "cancel" : "confirm"));
    }
    if (key.return) return choice === "confirm" ? onConfirm() : onCancel();
  });

  return (
    <DialogFrame title={title} width={width} height={height} tone={tone} rows={4}>
      <Text wrap="truncate">{subject}</Text>
      <Text dimColor wrap="truncate">
        {message}
      </Text>
      <Text> </Text>
      <Box gap={2}>
        <Text inverse={choice === "confirm"} color={tone === "danger" ? "red" : "yellow"}>
          {` ${confirmLabel} `}
        </Text>
        <Text inverse={choice === "cancel"}>{` Cancel `}</Text>
      </Box>
    </DialogFrame>
  );
}

export function RenameDialog({ value, width, height, onChange, onSave, onCancel }: RenameProps) {
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const bounds = dialogBounds(width, height, 4);
  return (
    <DialogFrame title="Rename session" width={width} height={height} rows={1}>
      <Box>
        <Text color="yellow">› </Text>
        <LineInput value={value} width={Math.max(1, bounds.width - 6)} onChange={onChange} onSubmit={onSave} />
      </Box>
    </DialogFrame>
  );
}

export function HighlightDialog({ value, width, height, onSave, onCancel }: HighlightDialogProps) {
  const [selected, setSelected] = useState(Math.max(0, HIGHLIGHT_OPTIONS.findIndex((o) => o.id === value)));

  useInput((input, key) => {
    if (key.escape) return onCancel();
    if (key.upArrow) return setSelected((i) => Math.max(0, i - 1));
    if (key.downArrow) return setSelected((i) => Math.min(HIGHLIGHT_OPTIONS.length - 1, i + 1));
    if (key.return || input === " ") return onSave(HIGHLIGHT_OPTIONS[selected]?.id);
  });

  return (
    <DialogFrame title="Session highlight" width={width} height={height} rows={HIGHLIGHT_OPTIONS.length + 1}>
      {HIGHLIGHT_OPTIONS.map((option, i) => (
        <Text key={option.label} inverse={i === selected} color={option.color} wrap="truncate">
          {` ${option.label} `}
        </Text>
      ))}
      <Text dimColor>↑↓ select · Enter saves · Esc cancels</Text>
    </DialogFrame>
  );
}
