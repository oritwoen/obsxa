import { parseArgs } from "node:util";
import { getDefaultDbPath } from "./core/db-path.ts";
import { createObsxa } from "./index.ts";
import type { ObsxaInstance } from "./index.ts";
import { computeInputHash, isSqliteConstraintError } from "./shared.ts";

const SKIP_TOOLS = new Set(["Read", "Grep", "Glob", "LSP", "ToolSearch"]);

export interface HookInput {
  tool_name?: string;
  tool_input?: unknown;
  session_id?: string;
  [key: string]: unknown;
}

async function findByInputHash(
  obsxa: ObsxaInstance,
  projectId: string,
  hash: string,
): Promise<number | undefined> {
  const found = await obsxa.observation.getByInputHash(projectId, hash);
  return found?.id;
}

export async function handlePostToolUse(
  obsxa: ObsxaInstance,
  projectId: string,
  input: HookInput,
): Promise<void> {
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName.length === 0) return;
  if (SKIP_TOOLS.has(toolName)) return;

  const toolInput = input.tool_input;
  const title = `Tool: ${toolName}`.slice(0, 200);
  const collector = "claude-code:PostToolUse";
  const dedupPayload = `${toolName}\n${JSON.stringify(toolInput ?? "")}`;
  const hash = computeInputHash(dedupPayload, collector, projectId);

  const existingId = await findByInputHash(obsxa, projectId, hash);
  if (existingId !== undefined) {
    await obsxa.observation.incrementFrequency(existingId);
    return;
  }

  const sessionId = typeof input.session_id === "string" ? input.session_id : "unknown";
  await obsxa.observation.add({
    projectId,
    title,
    description: toolInput ? JSON.stringify(toolInput).slice(0, 500) : undefined,
    type: "measurement",
    source: toolName,
    sourceType: "computation",
    collector,
    sourceRef: `session:${sessionId}:tool:${toolName}`,
    inputHash: hash,
    context: JSON.stringify({
      tool_name: toolName,
      session_id: sessionId,
    }),
  });
}

export async function handleSessionStart(
  obsxa: ObsxaInstance,
  projectId: string,
  input: HookInput,
): Promise<void> {
  const sessionId = typeof input.session_id === "string" ? input.session_id : "unknown";
  const collector = "claude-code:SessionStart";
  const title = `Session started: ${sessionId}`.slice(0, 200);
  const hash = computeInputHash(`session:${sessionId}`, collector, projectId);

  const existingId = await findByInputHash(obsxa, projectId, hash);
  if (existingId !== undefined) {
    await obsxa.observation.incrementFrequency(existingId);
    return;
  }

  await obsxa.observation.add({
    projectId,
    title,
    type: "pattern",
    source: sessionId,
    sourceType: "external",
    collector,
    sourceRef: `session:${sessionId}`,
    inputHash: hash,
    context: JSON.stringify({ session_id: sessionId }),
  });
}

export async function handleStop(
  obsxa: ObsxaInstance,
  projectId: string,
  input: HookInput,
): Promise<void> {
  const sessionId = typeof input.session_id === "string" ? input.session_id : "unknown";
  const collector = "claude-code:Stop";

  const stdinText = JSON.stringify(input);
  const title = `Response completed: ${sessionId}`.slice(0, 200);
  const hash = computeInputHash(stdinText, collector, projectId);

  const existingId = await findByInputHash(obsxa, projectId, hash);
  if (existingId !== undefined) {
    await obsxa.observation.incrementFrequency(existingId);
    return;
  }

  await obsxa.observation.add({
    projectId,
    title,
    type: "pattern",
    source: sessionId,
    sourceType: "external",
    collector,
    sourceRef: `session:${sessionId}`,
    inputHash: hash,
    context: JSON.stringify({ session_id: sessionId }),
  });
}

export async function handleHookEvent(
  event: string,
  input: HookInput,
  dbPath: string,
  projectId: string,
): Promise<void> {
  const obsxa = await createObsxa({ db: dbPath });
  try {
    try {
      await obsxa.project.add({ id: projectId, name: projectId });
    } catch (error) {
      if (!isSqliteConstraintError(error)) throw error;
    }

    switch (event) {
      case "PostToolUse":
        await handlePostToolUse(obsxa, projectId, input);
        break;
      case "SessionStart":
        await handleSessionStart(obsxa, projectId, input);
        break;
      case "Stop":
        await handleStop(obsxa, projectId, input);
        break;
      default:
        console.error(`[obsxa] Unknown hook event: ${event}`);
    }
  } finally {
    await obsxa.close();
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function runHookCli(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      db: { type: "string" },
      project: { type: "string", default: "default" },
      event: { type: "string" },
    },
    strict: false,
  });

  const event = values.event as string | undefined;
  if (!event) {
    console.error("[obsxa] --event is required");
    process.exit(1);
  }

  const dbPath = (values.db as string | undefined) ?? getDefaultDbPath();
  const projectId = (values.project as string | undefined) ?? "default";

  let input: HookInput = {};
  try {
    const raw = await readStdin();
    if (raw.trim().length > 0) {
      input = JSON.parse(raw);
    }
  } catch {
    // stdin may be empty or non-JSON
  }

  await handleHookEvent(event, input, dbPath, projectId);
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  runHookCli(process.argv.slice(2)).catch((err) => {
    console.error("[obsxa] Hook error:", err);
    process.exit(1);
  });
}
