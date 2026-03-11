import { readFileSync } from "node:fs";
import { decode } from "@toon-format/toon";
import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";
import type {
  ObservationBatchUpdateRecord,
  ObservationImportRecord,
  ObservationStatus,
  ObservationStatusReasonCode,
  ObservationType,
  SourceType,
} from "../types.ts";

const observationTypes: ObservationType[] = [
  "pattern",
  "anomaly",
  "measurement",
  "correlation",
  "artifact",
];
const sourceTypes: SourceType[] = ["experiment", "manual", "scan", "computation", "external"];
const statuses: ObservationStatus[] = ["active", "promoted", "dismissed", "archived"];
const reasonCodes: ObservationStatusReasonCode[] = [
  "noise",
  "duplicate",
  "merged",
  "irrelevant",
  "invalid",
  "manual_review",
];

function parseTags(tags?: string): string[] | undefined {
  if (tags === undefined) return undefined;
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseOptionalInt(
  value?: string,
  name = "value",
  opts?: { min?: number; max?: number },
): number | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0) {
    consola.error(`--${name} must not be empty`);
    process.exit(1);
  }
  if (!/^\d+$/.test(value)) {
    consola.error(`--${name} must be an integer, got "${value}"`);
    process.exit(1);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    consola.error(`--${name} must be a safe integer, got "${value}"`);
    process.exit(1);
  }
  if (opts?.min !== undefined && parsed < opts.min) {
    consola.error(`--${name} must be at least ${opts.min}, got "${value}"`);
    process.exit(1);
  }
  if (opts?.max !== undefined && parsed > opts.max) {
    consola.error(`--${name} must be at most ${opts.max}, got "${value}"`);
    process.exit(1);
  }
  return parsed;
}

const percentRange = { min: 0, max: 100 };

function readDataFile<T>(filePath: string): T {
  try {
    const raw = readFileSync(filePath, "utf8");
    if (filePath.endsWith(".toon")) return decode(raw) as T;
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `Failed to parse data from ${filePath}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

export default defineCommand({
  meta: { name: "observation", description: "Manage observations" },
  subCommands: {
    add: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "add", description: "Add observation" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
            title: { type: "string", required: true, description: "Title" },
            description: { type: "string", description: "Description" },
            type: {
              type: "string",
              description: "pattern|anomaly|measurement|correlation|artifact",
            },
            source: { type: "string", required: true, description: "Source label" },
            "source-type": {
              type: "string",
              description: "experiment|manual|scan|computation|external",
            },
            confidence: { type: "string", description: "Confidence 0-100" },
            tags: { type: "string", description: "Comma-separated tags" },
            data: { type: "string", description: "JSON/text data payload" },
            context: { type: "string", description: "Observation conditions/environment (JSON)" },
            "captured-at": { type: "string", description: "Observation capture timestamp" },
            "source-ref": { type: "string", description: "Opaque source reference" },
            collector: { type: "string", description: "Collector identity (agent/model)" },
            "input-hash": { type: "string", description: "Input fingerprint/hash" },
            evidence: { type: "string", description: "Evidence strength 0-100" },
            novelty: { type: "string", description: "Novelty 0-100" },
            uncertainty: { type: "string", description: "Uncertainty 0-100" },
            reproducibility: { type: "string", description: "Reproducibility hint" },
          },
          async run({ args }) {
            if (args.type && !observationTypes.includes(args.type as ObservationType)) {
              consola.error(
                `Invalid type "${args.type}". Must be one of: ${observationTypes.join(", ")}`,
              );
              process.exit(1);
            }
            if (args["source-type"] && !sourceTypes.includes(args["source-type"] as SourceType)) {
              consola.error(
                `Invalid source-type "${args["source-type"]}". Must be one of: ${sourceTypes.join(", ")}`,
              );
              process.exit(1);
            }

            const obsxa = await open(args.db);
            try {
              const observation = await obsxa.observation.add({
                projectId: args.project,
                title: args.title,
                description: args.description,
                type: args.type as ObservationType | undefined,
                source: args.source,
                sourceType: args["source-type"] as SourceType | undefined,
                confidence: parseOptionalInt(args.confidence, "confidence", percentRange),
                tags: parseTags(args.tags),
                data: args.data,
                context: args.context,
                capturedAt: args["captured-at"],
                sourceRef: args["source-ref"],
                collector: args.collector,
                inputHash: args["input-hash"],
                evidenceStrength: parseOptionalInt(args.evidence, "evidence", percentRange),
                novelty: parseOptionalInt(args.novelty, "novelty", percentRange),
                uncertainty: parseOptionalInt(args.uncertainty, "uncertainty", percentRange),
                reproducibilityHint: args.reproducibility,
              });
              if (args.toon || args.json) return output(observation, args.toon);
              consola.success(`Observation #${observation.id} created: ${observation.title}`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    import: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "import", description: "Import observations from JSON array file" },
          args: {
            ...dbArgs,
            file: {
              type: "string",
              required: true,
              description: "Path to JSON file with observation records",
            },
          },
          async run({ args }) {
            const records = readDataFile<ObservationImportRecord[]>(args.file);
            if (!Array.isArray(records)) {
              consola.error("Import file must contain a JSON array");
              process.exit(1);
            }
            const obsxa = await open(args.db);
            try {
              const imported = await obsxa.observation.addMany(records);
              if (args.toon || args.json) return output(imported, args.toon);
              consola.success(`Imported ${imported.length} observations`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    export: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "export", description: "Export project observations as JSON" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
            status: { type: "string", description: "Optional status filter" },
            type: { type: "string", description: "Optional type filter" },
          },
          async run({ args }) {
            if (args.status && !statuses.includes(args.status as ObservationStatus)) {
              consola.error(
                `Invalid status "${args.status}". Must be one of: ${statuses.join(", ")}`,
              );
              process.exit(1);
            }
            if (args.type && !observationTypes.includes(args.type as ObservationType)) {
              consola.error(
                `Invalid type "${args.type}". Must be one of: ${observationTypes.join(", ")}`,
              );
              process.exit(1);
            }

            const obsxa = await open(args.db);
            try {
              const rows = await obsxa.observation.list(args.project, {
                status: args.status as ObservationStatus | undefined,
                type: args.type as ObservationType | undefined,
              });
              output(rows, args.toon);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    "batch-update": () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "batch-update", description: "Apply batch updates from JSON array file" },
          args: {
            ...dbArgs,
            file: {
              type: "string",
              required: true,
              description: "Path to JSON file with update records",
            },
          },
          async run({ args }) {
            const records = readDataFile<ObservationBatchUpdateRecord[]>(args.file);
            if (!Array.isArray(records)) {
              consola.error("Batch-update file must contain a JSON array");
              process.exit(1);
            }
            const obsxa = await open(args.db);
            try {
              const updated = await obsxa.observation.updateMany(records);
              if (args.toon || args.json) return output(updated, args.toon);
              consola.success(`Updated ${updated.length} observations`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    get: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "get", description: "Get observation by ID" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const observation = await obsxa.observation.get(parseId(args.id, "id"));
              if (!observation) {
                consola.error(`Observation #${args.id} not found`);
                process.exit(1);
              }
              if (args.toon || args.json) return output(observation, args.toon);
              consola.log(
                `#${observation.id} [${observation.status}] f=${observation.frequency} triage=${observation.triageScore} ${observation.title}`,
              );
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    transitions: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "transitions", description: "List status transitions for observation" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const rows = await obsxa.observation.transitions(parseId(args.id, "id"));
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No transitions found.");
              for (const row of rows) {
                consola.log(`#${row.id} ${row.fromStatus} -> ${row.toStatus} (${row.reasonCode})`);
              }
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    edits: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "edits", description: "List edit history for observation" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const rows = await obsxa.observation.edits(parseId(args.id, "id"));
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No edits found.");
              for (const row of rows) {
                consola.log(
                  `${row.field}: ${row.oldValue ?? "(null)"} → ${row.newValue ?? "(null)"}`,
                );
              }
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    list: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "list", description: "List observations" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
            status: { type: "string", description: "Status filter" },
            type: { type: "string", description: "Type filter" },
          },
          async run({ args }) {
            if (args.status && !statuses.includes(args.status as ObservationStatus)) {
              consola.error(
                `Invalid status "${args.status}". Must be one of: ${statuses.join(", ")}`,
              );
              process.exit(1);
            }
            if (args.type && !observationTypes.includes(args.type as ObservationType)) {
              consola.error(
                `Invalid type "${args.type}". Must be one of: ${observationTypes.join(", ")}`,
              );
              process.exit(1);
            }

            const obsxa = await open(args.db);
            try {
              const rows = await obsxa.observation.list(args.project, {
                status: args.status as ObservationStatus | undefined,
                type: args.type as ObservationType | undefined,
              });
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No observations found.");
              for (const row of rows) {
                consola.log(
                  `#${row.id} [${row.status}] f=${row.frequency} triage=${row.triageScore} ${row.title}`,
                );
              }
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    update: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "update", description: "Update observation" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
            title: { type: "string", description: "Title" },
            description: { type: "string", description: "Description" },
            type: { type: "string", description: "Type" },
            source: { type: "string", description: "Source" },
            "source-type": { type: "string", description: "Source type" },
            confidence: { type: "string", description: "Confidence 0-100" },
            tags: { type: "string", description: "Comma-separated tags" },
            data: { type: "string", description: "Data payload" },
            context: { type: "string", description: "Observation conditions/environment (JSON)" },
            "captured-at": { type: "string", description: "Capture timestamp" },
            "source-ref": { type: "string", description: "Source reference" },
            collector: { type: "string", description: "Collector identity" },
            "input-hash": { type: "string", description: "Input hash" },
            evidence: { type: "string", description: "Evidence strength 0-100" },
            novelty: { type: "string", description: "Novelty 0-100" },
            uncertainty: { type: "string", description: "Uncertainty 0-100" },
            reproducibility: { type: "string", description: "Reproducibility hint" },
          },
          async run({ args }) {
            if (args.type && !observationTypes.includes(args.type as ObservationType)) {
              consola.error(
                `Invalid type "${args.type}". Must be one of: ${observationTypes.join(", ")}`,
              );
              process.exit(1);
            }
            if (args["source-type"] && !sourceTypes.includes(args["source-type"] as SourceType)) {
              consola.error(
                `Invalid source-type "${args["source-type"]}". Must be one of: ${sourceTypes.join(", ")}`,
              );
              process.exit(1);
            }

            const obsxa = await open(args.db);
            try {
              const result = await obsxa.observation.update(parseId(args.id, "id"), {
                title: args.title,
                description: args.description,
                type: args.type as ObservationType | undefined,
                source: args.source,
                sourceType: args["source-type"] as SourceType | undefined,
                confidence: parseOptionalInt(args.confidence, "confidence", percentRange),
                tags: parseTags(args.tags),
                data: args.data,
                context: args.context,
                capturedAt: args["captured-at"],
                sourceRef: args["source-ref"],
                collector: args.collector,
                inputHash: args["input-hash"],
                evidenceStrength: parseOptionalInt(args.evidence, "evidence", percentRange),
                novelty: parseOptionalInt(args.novelty, "novelty", percentRange),
                uncertainty: parseOptionalInt(args.uncertainty, "uncertainty", percentRange),
                reproducibilityHint: args.reproducibility,
              });
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(`Observation #${result.id} updated`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    dismiss: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "dismiss", description: "Dismiss observation" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
            reason: {
              type: "string",
              required: true,
              description: `Reason code: ${reasonCodes.join("|")}`,
            },
            note: { type: "string", description: "Optional reason note" },
          },
          async run({ args }) {
            if (!reasonCodes.includes(args.reason as ObservationStatusReasonCode)) {
              consola.error(
                `Invalid reason "${args.reason}". Must be one of: ${reasonCodes.join(", ")}`,
              );
              process.exit(1);
            }

            const obsxa = await open(args.db);
            try {
              const result = await obsxa.observation.dismiss(parseId(args.id, "id"), {
                reasonCode: args.reason as ObservationStatusReasonCode,
                reasonNote: args.note,
              });
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(`Observation #${result.id} dismissed`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    archive: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "archive", description: "Archive observation" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
            reason: {
              type: "string",
              required: true,
              description: `Reason code: ${reasonCodes.join("|")}`,
            },
            note: { type: "string", description: "Optional reason note" },
          },
          async run({ args }) {
            if (!reasonCodes.includes(args.reason as ObservationStatusReasonCode)) {
              consola.error(
                `Invalid reason "${args.reason}". Must be one of: ${reasonCodes.join(", ")}`,
              );
              process.exit(1);
            }
            const obsxa = await open(args.db);
            try {
              const result = await obsxa.observation.archive(parseId(args.id, "id"), {
                reasonCode: args.reason as ObservationStatusReasonCode,
                reasonNote: args.note,
              });
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(`Observation #${result.id} archived`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),

    bump: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "bump", description: "Increment observation frequency" },
          args: {
            ...dbArgs,
            id: { type: "positional", required: true, description: "Observation ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const result = await obsxa.observation.incrementFrequency(parseId(args.id, "id"));
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(`Observation #${result.id} frequency is now ${result.frequency}`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),
  },
});
