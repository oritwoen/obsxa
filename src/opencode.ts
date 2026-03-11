import { createHash } from "node:crypto";
import { getDefaultDbPath } from "./core/db-path.ts";
import { createObsxa } from "./index.ts";
import type { ObsxaInstance } from "./index.ts";

export interface ObsxaPluginOptions {
  db?: string;
  projectId?: string;
  projectName?: string;
  maxInjectedObservations?: number;
  maxInjectedChars?: number;
}

// Inline OpenCode plugin types (no runtime dependency on @opencode-ai/plugin)
// Source: /tmp/opencode/packages/plugin/src/index.ts
type PluginInput = {
  project: { id: string; [key: string]: unknown };
  directory: string;
  worktree: string;
  [key: string]: unknown;
};

type Hooks = {
  destroy?: () => Promise<void>;
  "chat.message"?: (
    input: { sessionID: string; agent?: string; model?: unknown; messageID?: string },
    output: { message: unknown; parts: unknown[] },
  ) => Promise<void>;
  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string; args: unknown },
    output: { title: string; output: string; metadata: unknown },
  ) => Promise<void>;
  event?: (input: { event: { type: string; properties: unknown } }) => Promise<void>;
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string; model: unknown },
    output: { system: string[] },
  ) => Promise<void>;
};

export type Plugin = (input: PluginInput) => Promise<Hooks>;

const SKIP_TOOLS = new Set([
  "read",
  "grep",
  "glob",
  "list_directory",
  "lsp_diagnostics",
  "lsp_find_references",
  "lsp_goto_definition",
  "lsp_symbols",
  "lsp_prepare_rename",
]);

const TRACKED_EVENTS: Record<string, "artifact" | "pattern" | "measurement" | "correlation"> = {
  "file.edited": "artifact",
  "session.created": "pattern",
  "session.idle": "measurement",
  "command.executed": "correlation",
};

const MAX_HASH_CACHE_SIZE = 2000;
const MAX_SESSION_CACHE_SIZE = 1000;

function getCacheValue(cache: Map<string, number>, key: string): number | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setCacheValue(
  cache: Map<string, number>,
  key: string,
  value: number,
  maxSize: number,
): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);

  if (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
}

function computeInputHash(payload: string, collector: string, projectId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ payload, collector, projectId }))
    .digest("hex");
}

async function findByHash(
  obsxa: ObsxaInstance,
  projectId: string,
  hash: string,
  cache: Map<string, number>,
): Promise<number | undefined> {
  const cached = getCacheValue(cache, hash);
  if (cached !== undefined) return cached;
  const found = await obsxa.observation.getByInputHash(projectId, hash);
  if (!found) return undefined;
  setCacheValue(cache, hash, found.id, MAX_HASH_CACHE_SIZE);
  return found.id;
}

const AGENT_INSTRUCTION =
  "When you notice patterns, anomalies, correlations, or interesting measurements during your work, record them using the observation tool for future reference. Types: pattern, anomaly, measurement, correlation, artifact.";

function formatObservations(
  results: Array<{
    observation: { title: string; type: string; confidence: number; frequency: number };
  }>,
  maxChars: number,
): string {
  const lines = results.map(
    (r) =>
      `- [${r.observation.type}] ${r.observation.title} (${r.observation.confidence}%, seen ${r.observation.frequency}x)`,
  );
  let output = "## Recent Observations\n" + lines.join("\n");
  if (output.length > maxChars) {
    const chars = Array.from(output);
    const truncated = chars.slice(0, Math.max(0, maxChars - 3)).join("");
    const lastNewline = truncated.lastIndexOf("\n");
    output = (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated) + "...";
  }
  return output;
}

function logHookError(scope: string, err: unknown): void {
  console.warn(`[obsxa] ${scope} hook error`, err);
}

export function createObsxaPlugin(options?: ObsxaPluginOptions): Plugin {
  return async (input: PluginInput): Promise<Hooks> => {
    const db = options?.db ?? getDefaultDbPath();
    const obsxa = await createObsxa({ db });
    let closed = false;

    const projectId = options?.projectId ?? input.project.id;
    const projectName = options?.projectName ?? projectId;

    if (!(await obsxa.project.get(projectId))) {
      await obsxa.project.add({ id: projectId, name: projectName });
    }

    let latestMessageBuffer = "";
    const hashCache = new Map<string, number>();
    // sessionID -> message observation ID (for derived_from relations)
    const sessionMessageObs = new Map<string, number>();

    return {
      destroy: async () => {
        if (closed) return;
        closed = true;
        hashCache.clear();
        sessionMessageObs.clear();
        latestMessageBuffer = "";
        try {
          await obsxa.close();
        } catch (err) {
          logHookError("destroy", err);
        }
      },

      "chat.message": async (msgInput, msgOutput) => {
        try {
          if (closed) return;
          const output = msgOutput as { message: unknown; parts: unknown[] } | null;
          if (!output) return;

          const parts = (output.parts ?? []) as Array<{
            type: string;
            text?: string;
            content?: string;
          }>;
          const text = parts
            .filter((p) => p.type === "text")
            .map((p) => p.text ?? p.content ?? "")
            .join(" ")
            .trim();

          if (text.length < 20) return;

          latestMessageBuffer = text;

          const msgObj = output.message as { summary?: { title?: string } } | null | undefined;
          const title = (msgObj?.summary?.title ?? text.slice(0, 100)).slice(0, 200);

          const collector = "opencode:chat.message";
          const hash = computeInputHash(text, collector, projectId);

          const existingId = await findByHash(obsxa, projectId, hash, hashCache);
          if (existingId !== undefined) {
            await obsxa.observation.incrementFrequency(existingId);
            return;
          }

          const sourceRef = `session:${msgInput.sessionID ?? "unknown"}:message:${msgInput.messageID ?? "unknown"}`;
          const obs = await obsxa.observation.add({
            projectId,
            title,
            description: text.length > 200 ? text.slice(0, 500) : undefined,
            type: "pattern",
            source: msgInput.agent ?? "user",
            sourceType: "manual",
            collector,
            sourceRef,
            inputHash: hash,
            context: JSON.stringify({
              sessionID: msgInput.sessionID,
              agent: msgInput.agent,
              model: msgInput.model,
              messageID: msgInput.messageID,
            }),
          });

          setCacheValue(hashCache, hash, obs.id, MAX_HASH_CACHE_SIZE);
          if (msgInput.sessionID) {
            setCacheValue(sessionMessageObs, msgInput.sessionID, obs.id, MAX_SESSION_CACHE_SIZE);
          }
        } catch (err) {
          logHookError("chat.message", err);
        }
      },

      "tool.execute.after": async (toolInput, toolOutput) => {
        try {
          if (closed) return;
          if (!toolOutput) return;
          if (SKIP_TOOLS.has(toolInput.tool)) return;

          const title = (toolOutput.title || toolInput.tool).slice(0, 200);
          const collector = "opencode:tool.execute.after";
          const dedupPayload = `${toolOutput.title || toolInput.tool}\n${String(toolOutput.output ?? "")}`;
          const hash = computeInputHash(dedupPayload, collector, projectId);

          const existingId = await findByHash(obsxa, projectId, hash, hashCache);
          if (existingId !== undefined) {
            await obsxa.observation.incrementFrequency(existingId);
            return;
          }

          const sourceRef = `session:${toolInput.sessionID}:call:${toolInput.callID}`;
          const description = toolOutput.output ? toolOutput.output.slice(0, 500) : undefined;

          const obs = await obsxa.observation.add({
            projectId,
            title,
            description,
            type: "measurement",
            source: toolInput.tool,
            sourceType: "computation",
            collector,
            sourceRef,
            inputHash: hash,
            context: JSON.stringify({
              tool: toolInput.tool,
              callID: toolInput.callID,
              sessionID: toolInput.sessionID,
            }),
          });

          setCacheValue(hashCache, hash, obs.id, MAX_HASH_CACHE_SIZE);

          // Create derived_from relation to message observation if exists for this session
          const msgObsId = getCacheValue(sessionMessageObs, toolInput.sessionID);
          if (msgObsId !== undefined) {
            try {
                await obsxa.relation.add({
                  fromObservationId: obs.id,
                  toObservationId: msgObsId,
                  type: "derived_from",
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const isConstraintViolation =
                message.includes("UNIQUE constraint") || message.includes("SQLITE_CONSTRAINT");
              if (!isConstraintViolation) {
                logHookError("tool.execute.after.relation", err);
              }
            }
          }
        } catch (err) {
          logHookError("tool.execute.after", err);
        }
      },

      event: async (evtInput) => {
        try {
          if (closed) return;
          if (!evtInput?.event) return;
          const evt = evtInput.event as { type: string; properties: Record<string, unknown> };
          const obsType = TRACKED_EVENTS[evt.type];
          if (!obsType) return;

          const props = evt.properties ?? {};

          let title: string;
          let source: string;
          if (evt.type === "file.edited") {
            const file = (props.file as string) ?? "unknown";
            title = `File edited: ${file}`;
            source = file;
          } else if (evt.type === "command.executed") {
            const name = (props.name as string) ?? "unknown";
            title = `Command executed: ${name}`;
            source = name;
          } else if (evt.type === "session.created") {
            const info =
              typeof props.info === "object" && props.info !== null
                ? (props.info as Record<string, unknown>)
                : null;
            const sessionId = typeof info?.id === "string" ? info.id : "unknown";
            title = `Session created: ${sessionId}`;
            source = sessionId;
          } else if (evt.type === "session.idle") {
            const sessionId = typeof props.sessionID === "string" ? props.sessionID : "unknown";
            const idleMs = typeof props.idleMs === "number" ? props.idleMs : undefined;
            title = idleMs !== undefined ? `Session idle: ${sessionId} (${idleMs}ms)` : `Session idle: ${sessionId}`;
            source = sessionId;
          } else {
            title = `Event: ${evt.type}`;
            source = evt.type;
          }

          title = title.slice(0, 200);
          const collector = `opencode:event:${evt.type}`;
          const hash = computeInputHash(
            `${evt.type}:${JSON.stringify(props)}`,
            collector,
            projectId,
          );

          const existingId = await findByHash(obsxa, projectId, hash, hashCache);
          if (existingId !== undefined) {
            await obsxa.observation.incrementFrequency(existingId);
            return;
          }

          const obs = await obsxa.observation.add({
            projectId,
            title,
            type: obsType,
            source,
            sourceType: "external",
            collector,
            inputHash: hash,
            context: JSON.stringify(props),
          });

          setCacheValue(hashCache, hash, obs.id, MAX_HASH_CACHE_SIZE);
        } catch (err) {
          logHookError("event", err);
        }
      },

      "experimental.chat.system.transform": async (_sysInput, sysOutput) => {
        try {
          if (closed) return;
          if (!sysOutput || !Array.isArray(sysOutput.system)) return;
          const maxObs = options?.maxInjectedObservations ?? 10;
          const maxChars = options?.maxInjectedChars ?? 2000;

          // Always push agent instruction
          sysOutput.system.push(`<obsxa-instruction>\n${AGENT_INSTRUCTION}\n</obsxa-instruction>`);

          // Use buffered message text or fall back to project name
          const query = latestMessageBuffer || projectName;

          // Cross-project search: pass undefined projectId
          const results = await obsxa.search.search(query, undefined, maxObs);

          if (results.length > 0) {
            const formatted = formatObservations(results, maxChars);
            sysOutput.system.push(`<obsxa-context>\n${formatted}\n</obsxa-context>`);
          }
        } catch (err) {
          logHookError("system.transform", err);
        }
      },
    };
  };
}

export default createObsxaPlugin;
