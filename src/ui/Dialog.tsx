import { Box, Text, useInput } from "ink";
import type { ReactNode } from "react";
import { useState } from "react";
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
