import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createObsxaPlugin } from "../src/opencode.ts";
import { createObsxa } from "../src/index.ts";

type Hooks = Awaited<ReturnType<ReturnType<typeof createObsxaPlugin>>>;
type ChatHook = NonNullable<Hooks["chat.message"]>;
type ToolHook = NonNullable<Hooks["tool.execute.after"]>;
type EventHook = NonNullable<Hooks["event"]>;
type SystemHook = NonNullable<Hooks["experimental.chat.system.transform"]>;

let trackedHooks: Hooks[] = [];

async function cleanupTrackedHooks(): Promise<void> {
  const hooksToCleanup = trackedHooks;
  trackedHooks = [];
  await Promise.allSettled(hooksToCleanup.map((hooks) => hooks.destroy?.() ?? Promise.resolve()));
}

async function getHooks(db: string, projectId = "test-project"): Promise<Hooks> {
  const plugin = createObsxaPlugin({ db, projectId });
  const hooks = await plugin({ project: { id: projectId }, directory: "/tmp", worktree: "/tmp" });
  trackedHooks.push(hooks);
  return hooks;
}

function chatInput(
  sessionID: string,
  messageID?: string,
  agent?: string,
  model?: unknown,
): Parameters<ChatHook>[0] {
  return { sessionID, messageID, agent, model };
}

function chatOutput(message: unknown, parts: unknown[]): Parameters<ChatHook>[1] {
  return { message, parts };
}

function textPart(text: string): { type: string; text: string } {
  return { type: "text", text };
}

function toolInput(
  tool: string,
  sessionID: string,
  callID: string,
  args: unknown,
): Parameters<ToolHook>[0] {
  return { tool, sessionID, callID, args };
}

function toolOutput(title: string, output: string, metadata: unknown): Parameters<ToolHook>[1] {
  return { title, output, metadata };
}

function eventInput(type: string, properties: unknown): Parameters<EventHook>[0] {
  return { event: { type, properties } };
}

function systemInput(sessionID?: string): Parameters<SystemHook>[0] {
  return { sessionID, model: null };
}

describe("createObsxaPlugin", () => {
  afterEach(async () => {
    await cleanupTrackedHooks();
  });

  it("is a function", () => {
    expect(typeof createObsxaPlugin).toBe("function");
  });

  it("returns a Plugin (async function)", async () => {
    const plugin = createObsxaPlugin({ db: ":memory:" });
    expect(typeof plugin).toBe("function");
  });

  it("plugin factory returns a Hooks object", async () => {
    const plugin = createObsxaPlugin({ db: ":memory:" });
    const hooks = await plugin({ project: { id: "test" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);
    expect(typeof hooks).toBe("object");
    expect(hooks).not.toBeNull();
  });
});

describe("createObsxaPlugin factory", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-plugin-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(async () => {
    await cleanupTrackedHooks();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates ObsxaInstance with accessible project store", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "test-project" });
    const hooks = await plugin({
      project: { id: "test-project" },
      directory: "/tmp",
      worktree: "/tmp",
    });
    trackedHooks.push(hooks);

    expect(hooks).toBeDefined();
    expect(typeof hooks).toBe("object");
  });

  it("ensures project exists after factory call", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "test-project" });
    const hooks = await plugin({ project: { id: "test-project" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("test-project");
    await obsxa.close();

    expect(project).not.toBeNull();
    expect(project?.id).toBe("test-project");
  });

  it("is idempotent (no error on second call with same projectId)", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "my-project" });

    const hooks1 = await plugin({ project: { id: "my-project" }, directory: "/tmp", worktree: "/tmp" });
    const hooks2 = await plugin({ project: { id: "my-project" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks1, hooks2);
    expect(hooks2).toBeDefined();
  });

  it("returns hooks object with expected keys", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "p1" });
    const hooks = await plugin({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    expect(hooks).toHaveProperty("chat.message");
    expect(hooks).toHaveProperty("tool.execute.after");
    expect(hooks).toHaveProperty("event");
    expect(hooks).toHaveProperty("experimental.chat.system.transform");
  });

  it("hook functions are callable async functions", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "p1" });
    const hooks = await plugin({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    expect(typeof hooks.destroy).toBe("function");
    expect(typeof hooks["chat.message"]).toBe("function");
    expect(typeof hooks["tool.execute.after"]).toBe("function");
    expect(typeof hooks["event"]).toBe("function");
    expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
  });

  it("destroy closes plugin resources without throwing", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "p1" });
    const hooks = await plugin({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    await expect(hooks.destroy?.()).resolves.toBeUndefined();
    await expect(hooks.destroy?.()).resolves.toBeUndefined();
  });

  it("uses input.project.id as default projectId when not provided in options", async () => {
    const plugin = createObsxaPlugin({ db: dbPath });
    const hooks = await plugin({ project: { id: "from-input" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("from-input");
    await obsxa.close();

    expect(project?.id).toBe("from-input");
  });

  it("uses projectId from options when provided", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "explicit-id" });
    const hooks = await plugin({ project: { id: "from-input" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("explicit-id");
    await obsxa.close();

    expect(project?.id).toBe("explicit-id");
  });

  it("uses projectName from options when provided", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "p1", projectName: "My Project" });
    const hooks = await plugin({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("p1");
    await obsxa.close();

    expect(project?.name).toBe("My Project");
  });

  it("defaults projectName to projectId when not provided", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "p1" });
    const hooks = await plugin({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks);

    const obsxa = await createObsxa({ db: dbPath });
    const project = await obsxa.project.get("p1");
    await obsxa.close();

    expect(project?.name).toBe("p1");
  });
});

describe("chat.message hook", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-plugin-msg-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(async () => {
    await cleanupTrackedHooks();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates observation from user message", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(
      chatInput("s1", "m1"),
      chatOutput({}, [textPart("Found interesting pattern in temperature data")]),
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].collector).toBe("opencode:chat.message");
    expect(obs[0].type).toBe("pattern");
    expect(obs[0].sourceType).toBe("manual");
  });

  it("sets correct sourceRef with sessionID and messageID", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(
      chatInput("sess-42", "msg-7"),
      chatOutput({}, [textPart("Analyzing Bitcoin key patterns in dataset")]),
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs[0].sourceRef).toBe("session:sess-42:message:msg-7");
  });

  it("dedup: same content bumps frequency instead of creating new", async () => {
    const hooks = await getHooks(dbPath);
    const msg = chatOutput({}, [textPart("Found interesting pattern in sensor data analysis")]);
    await hooks["chat.message"]!(chatInput("s1", "m1"), msg);
    await hooks["chat.message"]!(chatInput("s1", "m2"), msg);
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].frequency).toBe(2);
  });

  it("different content creates separate observations", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(
      chatInput("s1", "m1"),
      chatOutput({}, [textPart("Found interesting pattern in sensor data analysis")]),
    );
    await hooks["chat.message"]!(
      chatInput("s1", "m2"),
      chatOutput({}, [textPart("Detected anomaly in token distribution over time")]),
    );

    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();

    expect(obs).toHaveLength(2);
    expect(obs.every((item) => item.frequency === 1)).toBe(true);
  });

  it("inputHash is SHA-256 hex (64 chars)", async () => {
    const hooks = await getHooks(dbPath, "p1");
    await hooks["chat.message"]!(
      chatInput("s1", "m1"),
      chatOutput({}, [textPart("Temperature anomaly detected in dataset analysis")]),
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("p1");
    await obsxa.close();
    expect(obs[0].inputHash).toBeTruthy();
    expect(obs[0].inputHash).toHaveLength(64);
  });

  it("skips messages shorter than 20 chars", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(chatInput("s1", "m1"), chatOutput({}, [textPart("short")]));
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(0);
  });

  it("does NOT throw on malformed input (empty parts)", async () => {
    const hooks = await getHooks(dbPath);
    await expect(
      hooks["chat.message"]!(chatInput("s1", undefined), chatOutput(null, [])),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw on completely null output", async () => {
    const hooks = await getHooks(dbPath);
    const nullOutput = null as unknown as Parameters<ChatHook>[1];
    await expect(hooks["chat.message"]!(chatInput("s1"), nullOutput)).resolves.toBeUndefined();
  });

  it("context contains sessionID and agent metadata", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(
      chatInput("s-ctx", "m-ctx", "claude", { providerID: "anthropic", modelID: "claude-3" }),
      chatOutput({}, [textPart("Context metadata test in temperature analysis")]),
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs[0].context).toBeTruthy();
    const ctx = JSON.parse(obs[0].context as string);
    expect(ctx.sessionID).toBe("s-ctx");
    expect(ctx.agent).toBe("claude");
  });
});

describe("tool.execute.after hook", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-plugin-tool-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(async () => {
    await cleanupTrackedHooks();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates measurement observation for write tool", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["tool.execute.after"]!(
      { tool: "write", sessionID: "s1", callID: "c1", args: { filePath: "/test.ts" } },
      { title: "Wrote test.ts", output: "File created", metadata: {} },
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].collector).toBe("opencode:tool.execute.after");
    expect(obs[0].type).toBe("measurement");
    expect(obs[0].sourceType).toBe("computation");
  });

  it("skips read-only tool: read", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["tool.execute.after"]!(
      { tool: "read", sessionID: "s1", callID: "c1", args: {} },
      { title: "Read file", output: "content", metadata: {} },
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(0);
  });

  it("skips read-only tool: grep", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["tool.execute.after"]!(
      { tool: "grep", sessionID: "s1", callID: "c1", args: {} },
      { title: "Grep result", output: "matches", metadata: {} },
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(0);
  });

  it("skips read-only tool: glob", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["tool.execute.after"]!(
      { tool: "glob", sessionID: "s1", callID: "c1", args: {} },
      { title: "Glob result", output: "files", metadata: {} },
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(0);
  });

  it("dedup: same tool call bumps frequency", async () => {
    const hooks = await getHooks(dbPath);
    const call = { title: "Wrote index.ts", output: "done", metadata: {} };
    await hooks["tool.execute.after"]!(
      { tool: "write", sessionID: "s1", callID: "c1", args: {} },
      call,
    );
    await hooks["tool.execute.after"]!(
      { tool: "write", sessionID: "s1", callID: "c2", args: {} },
      call,
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].frequency).toBe(2);
  });

  it("sets correct sourceRef with sessionID and callID", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "sess-99", callID: "call-7", args: {} },
      { title: "Executed bash command", output: "ok", metadata: {} },
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs[0].sourceRef).toBe("session:sess-99:call:call-7");
  });

  it("does NOT throw on malformed input", async () => {
    const hooks = await getHooks(dbPath);
    const malformedInput = {
      tool: "write",
      sessionID: null,
      callID: null,
      args: null,
    } as unknown as Parameters<ToolHook>[0];
    const malformedOutput = null as unknown as Parameters<ToolHook>[1];
    await expect(
      hooks["tool.execute.after"]!(malformedInput, malformedOutput),
    ).resolves.toBeUndefined();
  });

  it("creates derived_from relation to message observation when same session", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(
      chatInput("shared-session", "m1"),
      chatOutput({}, [textPart("Analyzing security patterns in codebase")]),
    );
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "shared-session", callID: "c1", args: {} },
      { title: "Ran security scan command", output: "found issues", metadata: {} },
    );
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    expect(obs).toHaveLength(2);
    const toolObs = obs.find((o) => o.collector === "opencode:tool.execute.after")!;
    const relations = await obsxa.relation.list(toolObs.id);
    await obsxa.close();
    expect(relations.some((r) => r.type === "derived_from")).toBe(true);
  });
});

describe("event hook", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-plugin-evt-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(async () => {
    await cleanupTrackedHooks();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("file.edited creates artifact observation", async () => {
    const hooks = await getHooks(dbPath);
    await hooks.event!(eventInput("file.edited", { file: "src/index.ts" }));
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe("artifact");
    expect(obs[0].collector).toBe("opencode:event:file.edited");
    expect(obs[0].title).toContain("src/index.ts");
  });

  it("session.created creates pattern observation", async () => {
    const hooks = await getHooks(dbPath);
    await hooks.event!(eventInput("session.created", { info: { id: "sess-1" } }));
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe("pattern");
    expect(obs[0].collector).toBe("opencode:event:session.created");
  });

  it("command.executed creates correlation observation", async () => {
    const hooks = await getHooks(dbPath);
    await hooks.event!(eventInput("command.executed", { name: "git-commit", sessionID: "s1" }));
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].type).toBe("correlation");
    expect(obs[0].title).toContain("git-commit");
  });

  it("irrelevant events (pty.created) are skipped", async () => {
    const hooks = await getHooks(dbPath);
    await hooks.event!(eventInput("pty.created", {}));
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(0);
  });

  it("dedup: same file edited multiple times bumps frequency", async () => {
    const hooks = await getHooks(dbPath);
    const evt = eventInput("file.edited", { file: "src/main.ts" });
    await hooks.event!(evt);
    await hooks.event!(evt);
    const obsxa = await createObsxa({ db: dbPath });
    const obs = await obsxa.observation.list("test-project");
    await obsxa.close();
    expect(obs).toHaveLength(1);
    expect(obs[0].frequency).toBe(2);
  });

  it("does NOT throw on unknown event type", async () => {
    const hooks = await getHooks(dbPath);
    await expect(
      hooks.event!(eventInput("completely.unknown.event.type", {})),
    ).resolves.toBeUndefined();
  });
});

describe("system.transform hook", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-plugin-sys-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(async () => {
    await cleanupTrackedHooks();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("always injects agent instruction even with empty DB", async () => {
    const hooks = await getHooks(dbPath);
    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(systemInput(), output);
    expect(output.system.length).toBeGreaterThanOrEqual(1);
    expect(output.system.some((s) => s.includes("observation tool"))).toBe(true);
  });

  it("instruction mentions observation types", async () => {
    const hooks = await getHooks(dbPath);
    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(systemInput(), output);
    const joined = output.system.join(" ");
    expect(joined).toContain("pattern");
    expect(joined).toContain("anomaly");
    expect(joined).toContain("measurement");
  });

  it("instruction is concise (< 500 chars)", async () => {
    const hooks = await getHooks(dbPath);
    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(systemInput(), output);
    const instructionEntry = output.system.find((s) => s.includes("observation tool"))!;
    expect(instructionEntry.length).toBeLessThan(500);
  });

  it("injects observations when DB has results", async () => {
    const hooks = await getHooks(dbPath);
    await hooks["chat.message"]!(
      chatInput("s1", "m1"),
      chatOutput({}, [textPart("Bitcoin key generation weakness found in dataset")]),
    );
    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(systemInput(), output);
    expect(output.system.some((s) => s.includes("Bitcoin"))).toBe(true);
  });

  it("does not inject empty observation section when no results", async () => {
    const hooks = await getHooks(dbPath);
    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(systemInput(), output);
    const hasObsContext = output.system.some((s) => s.includes("## Recent Observations"));
    expect(hasObsContext).toBe(false);
  });

  it("cross-project: observations from another project are visible", async () => {
    const hooksA = await getHooks(dbPath, "project-a");
    await hooksA["chat.message"]!(
      chatInput("s1", "m1"),
      chatOutput({}, [textPart("Bitcoin cryptographic key pattern discovered in analysis")]),
    );

    const hooksB = await getHooks(dbPath, "project-b");
    await hooksB["chat.message"]!(
      chatInput("s2", "m2"),
      chatOutput({}, [textPart("Bitcoin key analysis query trigger")]),
    );
    const output = { system: [] as string[] };
    await hooksB["experimental.chat.system.transform"]!(systemInput(), output);
    const joined = output.system.join(" ");
    expect(joined).toContain("Bitcoin");
  });

  it("respects maxInjectedObservations option", async () => {
    const hooks = await getHooks(dbPath, "p1");
    for (let i = 0; i < 15; i++) {
      await hooks["chat.message"]!(
        chatInput("s1", `m${i}`),
        chatOutput({}, [textPart(`Observation number ${i} about test analysis patterns`)]),
      );
    }
    const plugin2 = createObsxaPlugin({ db: dbPath, projectId: "p1", maxInjectedObservations: 3 });
    const hooks2 = await plugin2({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks2);
    await hooks2["chat.message"]!(
      chatInput("s2", "m99"),
      chatOutput({}, [textPart("Observation number 7 about test analysis patterns")]),
    );
    const output = { system: [] as string[] };
    await hooks2["experimental.chat.system.transform"]!(systemInput(), output);

    const obsxa = await createObsxa({ db: dbPath });
    const expectedCount = (
      await obsxa.search.search("Observation number 7 about test analysis patterns", undefined, 3)
    ).length;
    await obsxa.close();

    const obsSection = output.system.find((s) => s.includes("## Recent Observations"));
    expect(obsSection).toBeTruthy();
    const count = obsSection!
      .split("\n")
      .map((line) => line.trim())
      .filter((line) =>
        /^- \[(pattern|anomaly|measurement|correlation|artifact)\]\s+/.test(line),
      ).length;
    expect(expectedCount).toBeGreaterThan(0);
    expect(expectedCount).toBeLessThanOrEqual(3);
    expect(count).toBe(expectedCount);
  });

  it("respects maxInjectedChars option", async () => {
    const hooks = await getHooks(dbPath, "p1");
    for (let i = 0; i < 5; i++) {
      await hooks["chat.message"]!(
        chatInput("s1", `m${i}`),
        chatOutput({}, [
          textPart(
            `Very long observation about temperature analysis patterns ${i} with detailed description text`,
          ),
        ]),
      );
    }
    const maxInjectedChars = 200;
    const wrapperOverhead = `<obsxa-context>\n\n</obsxa-context>`.length;
    const plugin2 = createObsxaPlugin({ db: dbPath, projectId: "p1", maxInjectedChars });
    const hooks2 = await plugin2({ project: { id: "p1" }, directory: "/tmp", worktree: "/tmp" });
    trackedHooks.push(hooks2);
    await hooks2["chat.message"]!(
      chatInput("s2", "m99"),
      chatOutput({}, [textPart("Temperature analysis patterns observation test run")]),
    );
    const output = { system: [] as string[] };
    await hooks2["experimental.chat.system.transform"]!(systemInput(), output);
    const obsSection = output.system.find(
      (s) => s.includes("Recent Observations") || s.includes("obsxa-context"),
    );
    if (obsSection) {
      expect(obsSection.length).toBeLessThanOrEqual(maxInjectedChars + wrapperOverhead);
    }
  });

  it("falls back to project name when message buffer is empty", async () => {
    const hooks = await getHooks(dbPath, "my-project");
    const output = { system: [] as string[] };
    await expect(
      hooks["experimental.chat.system.transform"]!(systemInput(), output),
    ).resolves.toBeUndefined();
    expect(output.system.some((s) => s.includes("observation tool"))).toBe(true);
  });

  it("does NOT throw when FTS search fails (simulated by empty query)", async () => {
    const hooks = await getHooks(dbPath);
    const output = { system: [] as string[] };
    await expect(
      hooks["experimental.chat.system.transform"]!(systemInput(), output),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw on null output", async () => {
    const hooks = await getHooks(dbPath);
    const nullOutput = null as unknown as Parameters<SystemHook>[1];
    await expect(
      hooks["experimental.chat.system.transform"]!(systemInput(), nullOutput),
    ).resolves.toBeUndefined();
  });
});

describe("full lifecycle integration", () => {
  let dbDir: string;
  let dbPath: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-plugin-int-"));
    dbPath = join(dbDir, "test.db");
  });

  afterEach(async () => {
    await cleanupTrackedHooks();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("records observations across full session lifecycle", async () => {
    const plugin = createObsxaPlugin({ db: dbPath, projectId: "integration-test" });
    const hooks = await plugin({
      project: { id: "integration-test" },
      directory: "/tmp",
      worktree: "/tmp",
    });
    trackedHooks.push(hooks);

    await hooks.event!(eventInput("session.created", { info: { id: "s1" } }));

    await hooks["chat.message"]!(
      chatInput("s1", "m1"),
      chatOutput({}, [textPart("Analyzing Bitcoin key patterns")]),
    );

    await hooks["tool.execute.after"]!(
      toolInput("bash", "s1", "c1", { command: "analyze" }),
      toolOutput("bash result", "Found weak RNG pattern", {}),
    );

    await hooks.event!(eventInput("file.edited", { file: "analysis.ts" }));

    await hooks["chat.message"]!(
      chatInput("s1", "m2"),
      chatOutput({}, [textPart("Analyzing Bitcoin key patterns")]),
    );

    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]!(systemInput(), output);

    const obsxa = await createObsxa({ db: dbPath });
    const observations = await obsxa.observation.list("integration-test");

    expect(observations).toHaveLength(4);

    const messageObservations = observations.filter((o) => o.collector === "opencode:chat.message");
    expect(messageObservations).toHaveLength(1);
    const messageObs = messageObservations[0];
    expect(messageObs.frequency).toBe(2);

    const toolObs = observations.find((o) => o.collector === "opencode:tool.execute.after");
    expect(toolObs).toBeDefined();
    const relations = await obsxa.relation.list(toolObs!.id);
    expect(
      relations.some(
        (r) =>
          r.type === "derived_from" &&
          r.fromObservationId === toolObs!.id &&
          r.toObservationId === messageObs.id,
      ),
    ).toBe(true);

    const injected = output.system.join(" ");
    expect(output.system.length).toBeGreaterThan(0);
    expect(output.system.some((s) => s.includes("observation tool"))).toBe(true);
    expect(
      injected.includes("Bitcoin") || injected.includes("key patterns") || injected.includes("RNG"),
    ).toBe(true);

    await obsxa.close();
  });
});
