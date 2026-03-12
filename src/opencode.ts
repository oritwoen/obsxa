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

type PluginInput = {
  client?: unknown;
  project: { id: string; [key: string]: unknown };
  directory: string;
  worktree: string;
  serverUrl?: URL;
  $?: unknown;
};

type Hooks = {
  destroy?: () => Promise<void>;
  event?: (input: {
    event: { type: string; properties: Record<string, unknown> };
  }) => Promise<void>;
  config?: (input: unknown) => Promise<void>;
  tool?: Record<string, unknown>;
  auth?: unknown;
  "chat.message"?: (
    input: {
      sessionID: string;
      agent?: string;
      model?: { providerID: string; modelID: string };
      messageID?: string;
      variant?: string;
    },
    output: {
      message: unknown;
      parts: Array<{ type: string; text?: string; content?: string; [key: string]: unknown }>;
    },
  ) => Promise<void>;
  "chat.params"?: (
    input: {
      sessionID: string;
      agent: string;
      model: unknown;
      provider: {
        source: "env" | "config" | "custom" | "api";
        info: unknown;
        options: Record<string, unknown>;
      };
      message: unknown;
    },
    output: { temperature: number; topP: number; topK: number; options: Record<string, unknown> },
  ) => Promise<void>;
  "chat.headers"?: (
    input: {
      sessionID: string;
      agent: string;
      model: unknown;
      provider: {
        source: "env" | "config" | "custom" | "api";
        info: unknown;
        options: Record<string, unknown>;
      };
      message: unknown;
    },
    output: { headers: Record<string, string> },
  ) => Promise<void>;
  "permission.ask"?: (
    input: unknown,
    output: { status: "ask" | "deny" | "allow" },
  ) => Promise<void>;
  "command.execute.before"?: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: unknown[] },
  ) => Promise<void>;
  "tool.execute.before"?: (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown },
  ) => Promise<void>;
  "shell.env"?: (
    input: { cwd: string; sessionID?: string; callID?: string },
    output: { env: Record<string, string> },
  ) => Promise<void>;
  "tool.execute.after"?: (
    input: { tool: string; sessionID: string; callID: string; args: unknown },
    output: { title: string; output: string; metadata: unknown },
  ) => Promise<void>;
  "experimental.chat.messages.transform"?: (
    input: {},
    output: { messages: Array<{ info: unknown; parts: unknown[] }> },
  ) => Promise<void>;
  "experimental.chat.system.transform"?: (
    input: { sessionID?: string; model: unknown },
    output: { system: string[] },
  ) => Promise<void>;
  "experimental.session.compacting"?: (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => Promise<void>;
  "experimental.text.complete"?: (
    input: { sessionID: string; messageID: string; partID: string },
    output: { text: string },
  ) => Promise<void>;
  "tool.definition"?: (
    input: { toolID: string },
    output: { description: string; parameters: unknown },
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

function getCacheValue<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setCacheValue<T>(cache: Map<string, T>, key: string, value: T, maxSize: number): void {
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
  "When you notice patterns, anomalies, correlations, or interesting measurements during your work, record them using the obsxa tool (operation=add) for future reference. Types: pattern, anomaly, measurement, correlation, artifact.";

async function createObsxaTool(
  obsxa: ObsxaInstance,
  defaultProjectId: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const pluginToolModule = await import("@opencode-ai/plugin/tool");
    const pluginTool = pluginToolModule.tool;
    const schema = pluginTool.schema;

    return pluginTool({
      description:
        "Manage obsxa observations: add/get/list/search/stats. Defaults to current OpenCode project when projectId is omitted.",
      args: {
        operation: schema.enum(["add", "get", "list", "search", "stats"]),
        projectId: schema.string().optional(),
        id: schema.number().optional(),
        title: schema.string().optional(),
        description: schema.string().optional(),
        type: schema
          .enum(["pattern", "anomaly", "measurement", "correlation", "artifact"])
          .optional(),
        source: schema.string().optional(),
        sourceType: schema
          .enum(["experiment", "manual", "scan", "computation", "external"])
          .optional(),
        confidence: schema.number().min(0).max(100).optional(),
        query: schema.string().optional(),
        status: schema.enum(["active", "promoted", "dismissed", "archived"]).optional(),
        limit: schema.number().optional(),
      },
      async execute(args) {
        const operation = String(args.operation ?? "");
        const projectId =
          typeof args.projectId === "string" && args.projectId.length > 0
            ? args.projectId
            : defaultProjectId;

        let result: unknown;
        switch (operation) {
          case "add": {
            const title = typeof args.title === "string" ? args.title : "";
            const source = typeof args.source === "string" ? args.source : "opencode";
            if (!title) throw new Error("obsxa tool: 'title' is required for add");
            result = await obsxa.observation.add({
              projectId,
              title,
              description: typeof args.description === "string" ? args.description : undefined,
              type:
                typeof args.type === "string"
                  ? (args.type as
                      | "pattern"
                      | "anomaly"
                      | "measurement"
                      | "correlation"
                      | "artifact")
                  : undefined,
              source,
              sourceType:
                typeof args.sourceType === "string"
                  ? (args.sourceType as
                      | "experiment"
                      | "manual"
                      | "scan"
                      | "computation"
                      | "external")
                  : undefined,
              confidence: typeof args.confidence === "number" ? args.confidence : undefined,
            });
            break;
          }
          case "get": {
            if (typeof args.id !== "number")
              throw new Error("obsxa tool: 'id' is required for get");
            result = await obsxa.observation.get(args.id);
            break;
          }
          case "list": {
            result = await obsxa.observation.list(projectId, {
              status:
                typeof args.status === "string"
                  ? (args.status as "active" | "promoted" | "dismissed" | "archived")
                  : undefined,
            });
            break;
          }
          case "search": {
            if (typeof args.query !== "string" || args.query.length === 0) {
              throw new Error("obsxa tool: 'query' is required for search");
            }
            result = await obsxa.search.search(
              args.query,
              projectId,
              typeof args.limit === "number" ? args.limit : undefined,
            );
            break;
          }
          case "stats": {
            result = await obsxa.analysis.stats(projectId);
            break;
          }
          default:
            throw new Error(
              "obsxa tool: unsupported operation; expected one of add/get/list/search/stats",
            );
        }

        return JSON.stringify(result, null, 2);
      },
    });
  } catch (error) {
    logHookError("tool.init", error);
    return undefined;
  }
}

function formatObservations(
  results: Array<{
    observation: { title: string; type: string; confidence: number; frequency: number };
  }>,
  maxChars: number,
): string {
  const sanitizeForContext = (value: string): string =>
    value
      .replace(/\r?\n+/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .trim();

  const lines = results.map(
    (r) =>
      `- [${sanitizeForContext(r.observation.type)}] ${sanitizeForContext(r.observation.title)} (${r.observation.confidence}%, seen ${r.observation.frequency}x)`,
  );
  let output = "## Recent Observations\n" + lines.join("\n");
  if (output.length > maxChars) {
    if (maxChars <= 0) return "";
    if (maxChars <= 3) return ".".repeat(maxChars);
    const chars = Array.from(output);
    const truncated = chars.slice(0, Math.max(0, maxChars - 3)).join("");
    const lastNewline = truncated.lastIndexOf("\n");
    output = (lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated) + "...";
  }
  return output;
}

function sanitizeEventLabel(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const path = record.path;
    if (typeof path === "string") {
      const trimmedPath = path.trim();
      if (trimmedPath.length > 0) return trimmedPath;
    }
    const name = record.name;
    if (typeof name === "string") {
      const trimmedName = name.trim();
      if (trimmedName.length > 0) return trimmedName;
    }
  }

  return "unknown";
}

function logHookError(scope: string, err: unknown): void {
  console.warn(`[obsxa] ${scope} hook error`, err);
}

function isSqliteConstraintError(error: unknown): boolean {
  let current: unknown = error;
  while (current) {
    const obj = current as {
      message?: unknown;
      code?: unknown;
      rawCode?: unknown;
      extendedCode?: unknown;
      cause?: unknown;
    };
    const message = typeof obj.message === "string" ? obj.message : String(obj.message ?? "");
    const code = typeof obj.code === "string" ? obj.code : String(obj.code ?? "");
    const rawCode = String(obj.rawCode ?? "");
    const extendedCode =
      typeof obj.extendedCode === "string" ? obj.extendedCode : String(obj.extendedCode ?? "");
    if (
      message.includes("UNIQUE constraint") ||
      message.includes("SQLITE_CONSTRAINT") ||
      code.includes("SQLITE_CONSTRAINT") ||
      extendedCode.includes("SQLITE_CONSTRAINT") ||
      rawCode === "1555"
    ) {
      return true;
    }
    current = obj.cause;
  }
  return false;
}

export function createObsxaPlugin(options?: ObsxaPluginOptions): Plugin {
  return async (input: PluginInput): Promise<Hooks> => {
    const db = options?.db ?? getDefaultDbPath();
    const obsxa = await createObsxa({ db });
    let closed = false;

    const closeOnInitError = async () => {
      if (closed) return;
      closed = true;
      try {
        await obsxa.close();
      } catch (err) {
        logHookError("init.close", err);
      }
    };

    try {
      const projectId = options?.projectId ?? input.project.id;
      const projectName = options?.projectName ?? projectId;
      let latestMessageBuffer = "";

      try {
        await obsxa.project.add({ id: projectId, name: projectName });
      } catch (error) {
        if (!isSqliteConstraintError(error)) {
          throw error;
        }
      }

      const latestMessageBufferBySession = new Map<string, string>();
      const hashCache = new Map<string, number>();
      const sessionMessageObs = new Map<string, number>();
      const obsxaTool = await createObsxaTool(obsxa, projectId);

      return {
        tool: obsxaTool
          ? {
              obsxa: obsxaTool,
            }
          : undefined,
        destroy: async () => {
          if (closed) return;
          closed = true;
          hashCache.clear();
          sessionMessageObs.clear();
          latestMessageBufferBySession.clear();
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

            if (msgInput.sessionID) {
              setCacheValue(
                latestMessageBufferBySession,
                msgInput.sessionID,
                text,
                MAX_SESSION_CACHE_SIZE,
              );
            }

            const msgObj = output.message as { summary?: { title?: string } } | null | undefined;
            const title = (msgObj?.summary?.title ?? text.slice(0, 100)).slice(0, 200);

            const collector = "opencode:chat.message";
            const hash = computeInputHash(text, collector, projectId);

            const existingId = await findByHash(obsxa, projectId, hash, hashCache);
            if (existingId !== undefined) {
              await obsxa.observation.incrementFrequency(existingId);
              if (msgInput.sessionID) {
                setCacheValue(
                  sessionMessageObs,
                  msgInput.sessionID,
                  existingId,
                  MAX_SESSION_CACHE_SIZE,
                );
              }
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
              const msgObsId = getCacheValue(sessionMessageObs, toolInput.sessionID);
              if (msgObsId !== undefined) {
                try {
                  await obsxa.relation.add({
                    fromObservationId: existingId,
                    toObservationId: msgObsId,
                    type: "derived_from",
                  });
                } catch (err) {
                  if (!isSqliteConstraintError(err)) {
                    logHookError("tool.execute.after.relation", err);
                  }
                }
              }
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
                if (!isSqliteConstraintError(err)) {
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
              const file = sanitizeEventLabel(props.file);
              title = `File edited: ${file}`;
              source = file;
            } else if (evt.type === "command.executed") {
              const name = sanitizeEventLabel(props.name);
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
              title =
                idleMs !== undefined
                  ? `Session idle: ${sessionId} (${idleMs}ms)`
                  : `Session idle: ${sessionId}`;
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
            sysOutput.system.push(
              `<obsxa-instruction>\n${AGENT_INSTRUCTION}\n</obsxa-instruction>`,
            );

            const query =
              (_sysInput.sessionID
                ? latestMessageBufferBySession.get(_sysInput.sessionID)
                : latestMessageBuffer) ?? projectName;

            const results = await obsxa.search.search(query, projectId, maxObs);

            if (results.length > 0) {
              const formatted = formatObservations(results, maxChars);
              sysOutput.system.push(`<obsxa-context>\n${formatted}\n</obsxa-context>`);
            }
          } catch (err) {
            logHookError("system.transform", err);
          }
        },
      };
    } catch (error) {
      await closeOnInitError();
      throw error;
    }
  };
}

export default createObsxaPlugin;
