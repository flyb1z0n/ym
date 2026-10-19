import { CODEX_BIN, hasCodex } from "./codex.ts";
import { AGENT_BIN, hasAgent } from "./cursor.ts";
import type { Agent, Session } from "./types.ts";

export const AGENTS: readonly Agent[] = ["cursor", "codex"];

export const AGENT_NAMES: Record<Agent, string> = { cursor: "Cursor", codex: "Codex" };

export const isAgent = (value: unknown): value is Agent => AGENTS.includes(value as Agent);

export const agentOf = (s: Pick<Session, "agent">): Agent => s.agent ?? "cursor";

export const agentAvailable = (agent: Agent) => (agent === "codex" ? hasCodex() : hasAgent());

export const agentBin = (agent: Agent) => (agent === "codex" ? CODEX_BIN() : AGENT_BIN());

export const notFound = (agent: Agent) => `${AGENT_NAMES[agent]} CLI \`${agentBin(agent)}\` not found on PATH`;
