import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerTools } from "../src/claude-code.ts";
import {
  handlePostToolUse,
  handleSessionStart,
  handleStop,
  handleHookEvent,
} from "../src/claude-code-hooks.ts";
import { createObsxa } from "../src/index.ts";
import type { ObsxaInstance } from "../src/index.ts";

describe("MCP server tool registration", () => {
  let dbDir: string;
  let dbPath: string;
  let obsxa: ObsxaInstance;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-mcp-"));
    dbPath = join(dbDir, "test.db");
    obsxa = await createObsxa({ db: dbPath });
    await obsxa.project.add({ id: "test-project", name: "test-project" });
  });

  afterEach(async () => {
    await obsxa.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("registers 7 tools on McpServer", () => {
    const server = new McpServer({ name: "obsxa-test", version: "0.0.1" });
    registerTools(server, obsxa, "test-project");

    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;
    const toolNames = Object.keys(registered);
    expect(toolNames).toHaveLength(7);
    expect(toolNames).toContain("obsxa_observation");
    expect(toolNames).toContain("obsxa_relation");
    expect(toolNames).toContain("obsxa_cluster");
    expect(toolNames).toContain("obsxa_search");
    expect(toolNames).toContain("obsxa_analysis");
    expect(toolNames).toContain("obsxa_promote");
    expect(toolNames).toContain("obsxa_dedup");
  });
});

describe("hook handler: PostToolUse", () => {
  let dbDir: string;
  let dbPath: string;
  let obsxa: ObsxaInstance;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-hook-post-"));
    dbPath = join(dbDir, "test.db");
    obsxa = await createObsxa({ db: dbPath });
    await obsxa.project.add({ id: "test-project", name: "test-project" });
  });

  afterEach(async () => {
    await obsxa.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates measurement observation for Bash tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "Bash",
      tool_input: { command: "ls -la" },
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe("measurement");
    expect(obs[0].collector).toBe("claude-code:PostToolUse");
    expect(obs[0].title).toContain("Bash");
  });

  it("creates measurement observation for Edit tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "Edit",
      tool_input: { file: "test.ts" },
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].source).toBe("Edit");
  });

  it("creates measurement observation for Write tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "Write",
      tool_input: { file: "new.ts" },
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
  });

  it("skips Read tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "Read",
      tool_input: {},
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(0);
  });

  it("skips Grep tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "Grep",
      tool_input: {},
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(0);
  });

  it("skips Glob tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "Glob",
      tool_input: {},
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(0);
  });

  it("skips LSP tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "LSP",
      tool_input: {},
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(0);
  });

  it("skips ToolSearch tool", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "ToolSearch",
      tool_input: {},
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(0);
  });

  it("dedup: same tool call twice bumps frequency", async () => {
    const input = {
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      session_id: "s1",
    };

    await handlePostToolUse(obsxa, "test-project", input);
    await handlePostToolUse(obsxa, "test-project", input);

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].frequency).toBe(2);
  });

  it("does not create observation for empty tool_name", async () => {
    await handlePostToolUse(obsxa, "test-project", {
      tool_name: "",
      tool_input: {},
      session_id: "s1",
    });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(0);
  });
});

describe("hook handler: SessionStart", () => {
  let dbDir: string;
  let dbPath: string;
  let obsxa: ObsxaInstance;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-hook-session-"));
    dbPath = join(dbDir, "test.db");
    obsxa = await createObsxa({ db: dbPath });
    await obsxa.project.add({ id: "test-project", name: "test-project" });
  });

  afterEach(async () => {
    await obsxa.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates pattern observation", async () => {
    await handleSessionStart(obsxa, "test-project", { session_id: "sess-1" });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe("pattern");
    expect(obs[0].collector).toBe("claude-code:SessionStart");
    expect(obs[0].title).toContain("sess-1");
  });

  it("dedup: same session start twice bumps frequency", async () => {
    await handleSessionStart(obsxa, "test-project", { session_id: "sess-1" });
    await handleSessionStart(obsxa, "test-project", { session_id: "sess-1" });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].frequency).toBe(2);
  });
});

describe("hook handler: Stop", () => {
  let dbDir: string;
  let dbPath: string;
  let obsxa: ObsxaInstance;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-hook-stop-"));
    dbPath = join(dbDir, "test.db");
    obsxa = await createObsxa({ db: dbPath });
    await obsxa.project.add({ id: "test-project", name: "test-project" });
  });

  afterEach(async () => {
    await obsxa.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates pattern observation", async () => {
    await handleStop(obsxa, "test-project", { session_id: "sess-1" });

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe("pattern");
    expect(obs[0].collector).toBe("claude-code:Stop");
    expect(obs[0].title).toContain("sess-1");
  });

  it("dedup: same stop event bumps frequency", async () => {
    const input = { session_id: "sess-1" };
    await handleStop(obsxa, "test-project", input);
    await handleStop(obsxa, "test-project", input);

    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(1);
    expect(obs[0].frequency).toBe(2);
  });
});

describe("handleHookEvent integration", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-hook-int-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("PostToolUse creates observation via handleHookEvent", async () => {
    await handleHookEvent(
      "PostToolUse",
      { tool_name: "Bash", tool_input: { command: "echo hi" }, session_id: "s1" },
      dbPath,
      "test-project",
    );

    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].collector).toBe("claude-code:PostToolUse");
  });

  it("SessionStart creates observation via handleHookEvent", async () => {
    await handleHookEvent("SessionStart", { session_id: "sess-42" }, dbPath, "test-project");

    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].collector).toBe("claude-code:SessionStart");
  });

  it("Stop creates observation via handleHookEvent", async () => {
    await handleHookEvent("Stop", { session_id: "sess-42" }, dbPath, "test-project");

    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].collector).toBe("claude-code:Stop");
  });

  it("creates project automatically", async () => {
    await handleHookEvent("SessionStart", { session_id: "s1" }, dbPath, "auto-project");

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("auto-project");
    await obsxa.close();
    expect(project).not.toBeNull();
    expect(project?.id).toBe("auto-project");
  });

  it("is idempotent for project creation", async () => {
    await handleHookEvent("SessionStart", { session_id: "s1" }, dbPath, "test-project");
    await handleHookEvent("SessionStart", { session_id: "s2" }, dbPath, "test-project");

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("test-project");
    await obsxa.close();
    expect(project?.id).toBe("test-project");
  });
});
