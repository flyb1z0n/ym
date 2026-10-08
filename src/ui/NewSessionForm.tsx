import { Box, Text, useInput } from "ink";
import { LineInput } from "./LineInput.tsx";
import { useEffect, useState } from "react";
import type { NewSessionInput } from "../core/actions.ts";
import { listModels, type Model } from "../core/cursor.ts";

const FIELDS = [
  { key: "prompt", label: "Prompt", placeholder: "what should the agent do? (empty = start idle)" },
  { key: "cwd", label: "Folder", placeholder: "" },
  { key: "model", label: "Model", placeholder: "default" },
  { key: "worktree", label: "Worktree", placeholder: "none (name to run in an isolated git worktree)" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

interface Props {
  defaultCwd: string;
  width: number;
  height: number;
  onSubmit: (input: NewSessionInput) => void;
  onCancel: () => void;
}

let modelCache: Model[] | undefined;

export function NewSessionForm({ defaultCwd, width, height, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    prompt: "",
    cwd: defaultCwd,
    model: "",
    worktree: "",
  });
  const [focus, setFocus] = useState(0);
  const [models, setModels] = useState<Model[] | undefined>(modelCache);
  const [error, setError] = useState("");

  useEffect(() => {
    if (modelCache) return;
    listModels(defaultCwd)
      .then((m) => setModels((modelCache = m)))
      .catch(() => setModels([]));
  }, [defaultCwd]);

  useInput((input, key) => {
    if (key.escape) onCancel();
    else if (key.downArrow || (key.tab && !key.shift)) setFocus((f) => (f + 1) % FIELDS.length);
    else if (key.upArrow || (key.tab && key.shift)) setFocus((f) => (f + FIELDS.length - 1) % FIELDS.length);
  });

  const submit = () => {
    const model = values.model.trim();
    if (model && models?.length && !models.some((m) => m.id === model)) {
      setError(`Unknown model "${model}"`);
      setFocus(2);
      return;
    }
    onSubmit({ prompt: values.prompt, cwd: values.cwd, model, worktree: values.worktree });
  };

  const modelQuery = values.model.trim().toLowerCase();
  const suggestions =
    focus === 2 && models
      ? models.filter((m) => !modelQuery || m.id.includes(modelQuery)).slice(0, Math.max(0, height - 12))
      : [];

  return (
    <Box borderStyle="round" width={width} height={height} flexDirection="column" paddingX={1}>
      <Text bold>New session</Text>
      <Text dimColor>Enter starts it · Tab/↑↓ switch fields · Esc cancels</Text>
      <Text> </Text>
      {FIELDS.map((field, i) => (
        <Box key={field.key}>
          <Text color={i === focus ? "green" : undefined}>{`${field.label.padEnd(9)} `}</Text>
          <LineInput
            value={values[field.key]}
            placeholder={field.placeholder}
            focus={i === focus}
            onChange={(v) => {
              setError("");
              setValues((prev) => ({ ...prev, [field.key]: v }));
            }}
            onSubmit={submit}
          />
        </Box>
      ))}
      {error ? <Text color="red">{error}</Text> : null}
      {focus === 2 && !models ? <Text dimColor>loading models…</Text> : null}
      {suggestions.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {suggestions.map((m) => (
            <Text key={m.id} dimColor wrap="truncate">
              {`${m.id}  ${m.label}`}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
