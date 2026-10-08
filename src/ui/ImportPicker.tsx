import { Box, Text, useInput } from "ink";
import { LineInput } from "./LineInput.tsx";
import { useMemo, useState } from "react";
import type { CursorChat } from "../core/importer.ts";
import { age, fit, tildify, windowStart } from "./format.ts";

interface Props {
  chats: CursorChat[];
  width: number;
  height: number;
  onImport: (chat: CursorChat) => void;
  onClose: () => void;
}

export function ImportPicker({ chats, width, height, onImport, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q) || c.cwd.toLowerCase().includes(q));
  }, [chats, query]);
  const index = Math.min(selected, Math.max(0, visible.length - 1));

  useInput((_input, key) => {
    if (key.escape) onClose();
    else if (key.downArrow) setSelected(Math.min(index + 1, visible.length - 1));
    else if (key.upArrow) setSelected(Math.max(index - 1, 0));
  });

  const bodyHeight = height - 5;
  const start = windowStart(visible.length, index, bodyHeight);
  const inner = width - 4;
  const ageWidth = 4;
  const folderWidth = Math.min(40, Math.floor(inner * 0.4));
  const titleWidth = Math.max(4, inner - folderWidth - ageWidth - 2);

  return (
    <Box borderStyle="round" width={width} height={height} flexDirection="column" paddingX={1}>
      <Text bold>
        Import Cursor chats <Text dimColor>({visible.length})</Text>
        <Text dimColor> · Enter adds to the dashboard · Esc closes</Text>
      </Text>
      <Box>
        <Text color="green">filter </Text>
        <LineInput
          value={query}
          placeholder="type to filter by title or folder"
          onChange={(v) => {
            setQuery(v);
            setSelected(0);
          }}
          onSubmit={() => {
            const chat = visible[index];
            if (chat) onImport(chat);
          }}
        />
      </Box>
      <Text> </Text>
      {visible.length === 0 ? (
        <Text dimColor>No chats to import.</Text>
      ) : (
        visible.slice(start, start + bodyHeight).map((chat, i) => (
          <Text key={chat.chatId} wrap="truncate" inverse={start + i === index}>
            {fit(chat.title, titleWidth)} <Text dimColor>{fit(tildify(chat.cwd), folderWidth)}</Text>{" "}
            <Text dimColor>{age(chat.updatedAt).padStart(ageWidth)}</Text>
          </Text>
        ))
      )}
    </Box>
  );
}
