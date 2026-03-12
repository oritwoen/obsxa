import { parseArgs } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { getDefaultDbPath } from "./core/db-path.ts";
import { createObsxa } from "./index.ts";
import type { ObsxaInstance } from "./index.ts";
import { isSqliteConstraintError } from "./shared.ts";

const OBSERVATION_TYPES = ["pattern", "anomaly", "measurement", "correlation", "artifact"] as const;
const SOURCE_TYPES = ["experiment", "manual", "scan", "computation", "external"] as const;
const STATUS_VALUES = ["active", "promoted", "dismissed", "archived"] as const;
const REASON_CODES = [
  "noise",
  "duplicate",
  "merged",
  "irrelevant",
  "invalid",
  "manual_review",
] as const;
const RELATION_TYPES = [
  "similar_to",
  "contradicts",
  "supports",
  "derived_from",
  "duplicate_of",
  "refines",
  "same_signal_as",
] as const;

function textResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function registerTools(
  server: McpServer,
  obsxa: ObsxaInstance,
  defaultProjectId: string,
): void {
  const projectOr = (input: string | undefined): string =>
    input && input.length > 0 ? input : defaultProjectId;

  server.tool(
    "obsxa_observation",
    "Manage observations: add/get/list/update/dismiss/archive/bump/transitions/edits/import/batchUpdate",
    {
      operation: z.enum([
        "add",
        "get",
        "list",
        "update",
        "dismiss",
        "archive",
        "bump",
        "transitions",
        "edits",
        "import",
        "batchUpdate",
      ]),
      projectId: z.string().optional(),
      id: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(OBSERVATION_TYPES).optional(),
      source: z.string().optional(),
      sourceType: z.enum(SOURCE_TYPES).optional(),
      confidence: z.number().optional(),
      tags: z.string().optional(),
      data: z.string().optional(),
      context: z.string().optional(),
      capturedAt: z.string().optional(),
      sourceRef: z.string().optional(),
      collector: z.string().optional(),
      inputHash: z.string().optional(),
      evidenceStrength: z.number().optional(),
      novelty: z.number().optional(),
      uncertainty: z.number().optional(),
      reproducibilityHint: z.string().optional(),
      status: z.enum(STATUS_VALUES).optional(),
      reasonCode: z.enum(REASON_CODES).optional(),
      reasonNote: z.string().optional(),
      records: z.string().optional(),
    },
    async (args) => {
      const pid = projectOr(args.projectId);
      const parseTags = (s?: string): string[] | undefined => {
        if (!s) return undefined;
        try {
          const parsed = JSON.parse(s);
          return Array.isArray(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      };

      switch (args.operation) {
        case "add": {
          if (!args.title) return errorResult("'title' is required for add");
          if (!args.source) return errorResult("'source' is required for add");
          const result = await obsxa.observation.add({
            projectId: pid,
            title: args.title,
            description: args.description,
            type: args.type,
            source: args.source,
            sourceType: args.sourceType,
            confidence: args.confidence,
            tags: parseTags(args.tags),
            data: args.data,
            context: args.context,
            capturedAt: args.capturedAt,
            sourceRef: args.sourceRef,
            collector: args.collector,
            inputHash: args.inputHash,
            evidenceStrength: args.evidenceStrength,
            novelty: args.novelty,
            uncertainty: args.uncertainty,
            reproducibilityHint: args.reproducibilityHint,
          });
          return textResult(result);
        }
        case "get": {
          if (args.id === undefined) return errorResult("'id' is required for get");
          const obs = await obsxa.observation.get(args.id);
          return textResult(obs);
        }
        case "list": {
          const result = await obsxa.observation.list(pid, {
            status: args.status,
            type: args.type,
            sourceType: args.sourceType,
          });
          return textResult(result);
        }
        case "update": {
          if (args.id === undefined) return errorResult("'id' is required for update");
          const result = await obsxa.observation.update(args.id, {
            title: args.title,
            description: args.description,
            type: args.type,
            source: args.source,
            sourceType: args.sourceType,
            confidence: args.confidence,
            tags: parseTags(args.tags),
            data: args.data,
            context: args.context,
            capturedAt: args.capturedAt,
            sourceRef: args.sourceRef,
            collector: args.collector,
            inputHash: args.inputHash,
            evidenceStrength: args.evidenceStrength,
            novelty: args.novelty,
            uncertainty: args.uncertainty,
            reproducibilityHint: args.reproducibilityHint,
          });
          return textResult(result);
        }
        case "dismiss": {
          if (args.id === undefined) return errorResult("'id' is required for dismiss");
          if (!args.reasonCode) return errorResult("'reasonCode' is required for dismiss");
          const result = await obsxa.observation.dismiss(args.id, {
            reasonCode: args.reasonCode,
            reasonNote: args.reasonNote,
          });
          return textResult(result);
        }
        case "archive": {
          if (args.id === undefined) return errorResult("'id' is required for archive");
          if (!args.reasonCode) return errorResult("'reasonCode' is required for archive");
          const result = await obsxa.observation.archive(args.id, {
            reasonCode: args.reasonCode,
            reasonNote: args.reasonNote,
          });
          return textResult(result);
        }
        case "bump": {
          if (args.id === undefined) return errorResult("'id' is required for bump");
          const result = await obsxa.observation.incrementFrequency(args.id);
          return textResult(result);
        }
        case "transitions": {
          if (args.id === undefined) return errorResult("'id' is required for transitions");
          const result = await obsxa.observation.transitions(args.id);
          return textResult(result);
        }
        case "edits": {
          if (args.id === undefined) return errorResult("'id' is required for edits");
          const result = await obsxa.observation.edits(args.id);
          return textResult(result);
        }
        case "import": {
          if (!args.records) return errorResult("'records' (JSON string) is required for import");
          let parsed: unknown[];
          try {
            parsed = JSON.parse(args.records);
          } catch {
            return errorResult("'records' must be a valid JSON array");
          }
          if (!Array.isArray(parsed)) return errorResult("'records' must be a JSON array");
          const result = await obsxa.observation.addMany(
            parsed as Parameters<typeof obsxa.observation.addMany>[0],
          );
          return textResult(result);
        }
        case "batchUpdate": {
          if (!args.records)
            return errorResult("'records' (JSON string) is required for batchUpdate");
          let parsed: unknown[];
          try {
            parsed = JSON.parse(args.records);
          } catch {
            return errorResult("'records' must be a valid JSON array");
          }
          if (!Array.isArray(parsed)) return errorResult("'records' must be a JSON array");
          const result = await obsxa.observation.updateMany(
            parsed as Parameters<typeof obsxa.observation.updateMany>[0],
          );
          return textResult(result);
        }
        default:
          return errorResult(`Unknown operation: ${args.operation}`);
      }
    },
  );

  server.tool(
    "obsxa_relation",
    "Manage observation relations: add and list",
    {
      operation: z.enum(["add", "list"]),
      fromObservationId: z.number().optional(),
      toObservationId: z.number().optional(),
      observationId: z.number().optional(),
      type: z.enum(RELATION_TYPES).optional(),
      confidence: z.number().optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      switch (args.operation) {
        case "add": {
          if (args.fromObservationId === undefined)
            return errorResult("'fromObservationId' is required for add");
          if (args.toObservationId === undefined)
            return errorResult("'toObservationId' is required for add");
          if (!args.type) return errorResult("'type' is required for add");
          const result = await obsxa.relation.add({
            fromObservationId: args.fromObservationId,
            toObservationId: args.toObservationId,
            type: args.type,
            confidence: args.confidence,
            notes: args.notes,
          });
          return textResult(result);
        }
        case "list": {
          if (args.observationId === undefined)
            return errorResult("'observationId' is required for list");
          const result = await obsxa.relation.list(args.observationId);
          return textResult(result);
        }
        default:
          return errorResult(`Unknown operation: ${args.operation}`);
      }
    },
  );

  server.tool(
    "obsxa_cluster",
    "Manage observation clusters: add, list, addMember, listMembers",
    {
      operation: z.enum(["add", "list", "addMember", "listMembers"]),
      projectId: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      clusterId: z.number().optional(),
      observationId: z.number().optional(),
    },
    async (args) => {
      const pid = projectOr(args.projectId);
      switch (args.operation) {
        case "add": {
          if (!args.name) return errorResult("'name' is required for add");
          const result = await obsxa.cluster.add({
            projectId: pid,
            name: args.name,
            description: args.description,
          });
          return textResult(result);
        }
        case "list": {
          const result = await obsxa.cluster.list(pid);
          return textResult(result);
        }
        case "addMember": {
          if (args.clusterId === undefined) return errorResult("'clusterId' is required");
          if (args.observationId === undefined) return errorResult("'observationId' is required");
          const result = await obsxa.cluster.addMember(args.clusterId, args.observationId);
          return textResult(result);
        }
        case "listMembers": {
          if (args.clusterId === undefined) return errorResult("'clusterId' is required");
          const result = await obsxa.cluster.listMembers(args.clusterId);
          return textResult(result);
        }
        default:
          return errorResult(`Unknown operation: ${args.operation}`);
      }
    },
  );

  server.tool(
    "obsxa_search",
    "Search observations via FTS or LIKE fallback",
    {
      query: z.string(),
      projectId: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) => {
      const result = await obsxa.search.search(args.query, args.projectId, args.limit);
      return textResult(result);
    },
  );

  server.tool(
    "obsxa_analysis",
    "Run observation analyses: stats, frequent, isolated, convergent, promoted, unpromoted, triage",
    {
      operation: z.enum([
        "stats",
        "frequent",
        "isolated",
        "convergent",
        "promoted",
        "unpromoted",
        "triage",
      ]),
      projectId: z.string().optional(),
      limit: z.number().optional(),
      sort: z.enum(["triage", "recent"]).optional(),
    },
    async (args) => {
      const pid = projectOr(args.projectId);
      switch (args.operation) {
        case "stats":
          return textResult(await obsxa.analysis.stats(pid));
        case "frequent":
          return textResult(await obsxa.analysis.frequent(pid));
        case "isolated":
          return textResult(await obsxa.analysis.isolated(pid));
        case "convergent":
          return textResult(await obsxa.analysis.convergent(pid));
        case "promoted":
          return textResult(await obsxa.analysis.promoted(pid));
        case "unpromoted":
          return textResult(await obsxa.analysis.unpromoted(pid));
        case "triage":
          return textResult(await obsxa.analysis.triage(pid, args.limit, args.sort));
        default:
          return errorResult(`Unknown operation: ${args.operation}`);
      }
    },
  );

  server.tool(
    "obsxa_promote",
    "Promote active observation to hypothesis candidate",
    {
      observationId: z.number(),
      hypothesisRef: z.string(),
    },
    async (args) => {
      const result = await obsxa.observation.promote(args.observationId, args.hypothesisRef);
      return textResult(result);
    },
  );

  server.tool(
    "obsxa_dedup",
    "Dedup workflow: scan/list/review candidates and merge duplicates",
    {
      operation: z.enum(["scan", "candidates", "review", "merge"]),
      projectId: z.string().optional(),
      threshold: z.number().optional(),
      status: z.enum(["open", "resolved", "dismissed", "all"]).optional(),
      candidateId: z.number().optional(),
      reason: z.string().optional(),
      primaryObservationId: z.number().optional(),
      duplicateObservationId: z.number().optional(),
      confidenceStrategy: z.enum(["primary", "max", "average"]).optional(),
      relationType: z.enum(RELATION_TYPES).optional(),
      relationConfidence: z.number().optional(),
      relationNotes: z.string().optional(),
      mergeDescription: z.enum(["primary", "duplicate", "concat"]).optional(),
    },
    async (args) => {
      const pid = projectOr(args.projectId);
      switch (args.operation) {
        case "scan":
          return textResult(await obsxa.dedup.scan(pid, args.threshold));
        case "candidates":
          return textResult(
            await obsxa.dedup.candidates(
              pid,
              args.status as "open" | "resolved" | "dismissed" | "all" | undefined,
            ),
          );
        case "review": {
          if (args.candidateId === undefined)
            return errorResult("'candidateId' is required for review");
          if (!args.status || !["open", "resolved", "dismissed"].includes(args.status))
            return errorResult("'status' must be open/resolved/dismissed for review");
          if (!args.reason) return errorResult("'reason' is required for review");
          return textResult(
            await obsxa.dedup.review(
              args.candidateId,
              args.status as "open" | "resolved" | "dismissed",
              args.reason,
            ),
          );
        }
        case "merge": {
          if (args.primaryObservationId === undefined)
            return errorResult("'primaryObservationId' is required for merge");
          if (args.duplicateObservationId === undefined)
            return errorResult("'duplicateObservationId' is required for merge");
          return textResult(
            await obsxa.dedup.merge(args.primaryObservationId, args.duplicateObservationId, {
              confidenceStrategy: args.confidenceStrategy,
              relationType: args.relationType,
              relationConfidence: args.relationConfidence,
              relationNotes: args.relationNotes,
              mergeDescription: args.mergeDescription,
            }),
          );
        }
        default:
          return errorResult(`Unknown operation: ${args.operation}`);
      }
    },
  );
}

export async function startMcpServer(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      db: { type: "string" },
      project: { type: "string", default: "default" },
    },
    strict: false,
  });

  const dbPath = (values.db as string | undefined) ?? getDefaultDbPath();
  const projectId = (values.project as string | undefined) ?? "default";

  const obsxa = await createObsxa({ db: dbPath });

  try {
    await obsxa.project.add({ id: projectId, name: projectId });
  } catch (error) {
    if (!isSqliteConstraintError(error)) {
      await obsxa.close();
      throw error;
    }
  }

  const server = new McpServer({
    name: "obsxa",
    version: "0.0.3",
  });

  registerTools(server, obsxa, projectId);

  const transport = new StdioServerTransport();
  const shutdown = async () => {
    try {
      await server.close();
    } catch {}
    try {
      await obsxa.close();
    } catch {}
  };

  process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

  await server.connect(transport);
  console.error("[obsxa] MCP server started");
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  startMcpServer(process.argv.slice(2)).catch((err) => {
    console.error("[obsxa] Fatal:", err);
    process.exit(1);
  });
}
