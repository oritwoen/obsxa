import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";
import type {
  DuplicateCandidateStatus,
  MergeConfidenceStrategy,
  ObservationRelationType,
} from "../types.ts";
import { RELATION_TYPES } from "../types.ts";

const statuses: DuplicateCandidateStatus[] = ["open", "resolved", "dismissed"];
const confidenceStrategies: MergeConfidenceStrategy[] = ["primary", "max", "average"];

export default defineCommand({
  meta: { name: "dedup", description: "Detect and merge duplicate observations" },
  subCommands: {
    scan: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "scan", description: "Scan project observations for duplicate candidates" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
            threshold: {
              type: "string",
              description: "Near-duplicate threshold (0..1, default 0.72)",
            },
          },
          run({ args }) {
            const threshold = args.threshold ? Number.parseFloat(args.threshold) : 0.72;
            if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
              consola.error("Threshold must be a number from 0 to 1");
              process.exit(1);
            }

            const obsxa = open(args.db);
            try {
              const result = obsxa.dedup.scan(args.project, threshold);
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(
                `Scanned ${result.checkedPairs} pairs, found ${result.candidates.length} candidates`,
              );
            } finally {
              obsxa.close();
            }
          },
        }),
      ),

    candidates: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "candidates", description: "List duplicate candidates" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
            status: { type: "string", description: "open|resolved|dismissed|all (default: open)" },
          },
          run({ args }) {
            if (
              args.status &&
              args.status !== "all" &&
              !statuses.includes(args.status as DuplicateCandidateStatus)
            ) {
              consola.error(
                `Invalid status "${args.status}". Must be one of: ${[...statuses, "all"].join(", ")}`,
              );
              process.exit(1);
            }

            const status = (args.status ?? "open") as DuplicateCandidateStatus | "all";
            const obsxa = open(args.db);
            try {
              const rows = obsxa.dedup.candidates(args.project, status);
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No duplicate candidates found.");
              for (const row of rows) {
                consola.log(
                  `#${row.id} ${row.primaryObservationId}<->${row.duplicateObservationId} score=${row.score.toFixed(3)} ${row.reason} [${row.status}]`,
                );
              }
            } finally {
              obsxa.close();
            }
          },
        }),
      ),

    review: () =>
      Promise.resolve(
        defineCommand({
          meta: {
            name: "review",
            description: "Review duplicate candidate and set status with reason",
          },
          args: {
            ...dbArgs,
            id: { type: "string", required: true, description: "Candidate ID" },
            status: { type: "string", required: true, description: "open|resolved|dismissed" },
            reason: { type: "string", required: true, description: "Decision reason" },
          },
          run({ args }) {
            if (!statuses.includes(args.status as DuplicateCandidateStatus)) {
              consola.error(
                `Invalid status "${args.status}". Must be one of: ${statuses.join(", ")}`,
              );
              process.exit(1);
            }

            const id = parseId(args.id, "id");

            const obsxa = open(args.db);
            try {
              const result = obsxa.dedup.review(
                id,
                args.status as DuplicateCandidateStatus,
                args.reason,
              );
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(
                `Candidate #${result.candidate.id} moved to ${result.candidate.status}`,
              );
            } finally {
              obsxa.close();
            }
          },
        }),
      ),

    merge: () =>
      Promise.resolve(
        defineCommand({
          meta: {
            name: "merge",
            description: "Merge duplicate observation into primary observation",
          },
          args: {
            ...dbArgs,
            primary: { type: "string", required: true, description: "Primary observation ID" },
            duplicate: {
              type: "string",
              required: true,
              description: "Observation ID to merge/archive",
            },
            strategy: { type: "string", description: "primary|max|average (default: max)" },
            "relation-type": {
              type: "string",
              description: `Relation type (${RELATION_TYPES.join("|")})`,
            },
            "relation-confidence": { type: "string", description: "0..100 (default: 100)" },
            "relation-notes": {
              type: "string",
              description: "Optional notes for created relation",
            },
            description: {
              type: "string",
              description: "primary|duplicate|concat (default: concat)",
            },
          },
          run({ args }) {
            if (
              args.strategy &&
              !confidenceStrategies.includes(args.strategy as MergeConfidenceStrategy)
            ) {
              consola.error(
                `Invalid strategy "${args.strategy}". Must be one of: ${confidenceStrategies.join(", ")}`,
              );
              process.exit(1);
            }
            if (
              args["relation-type"] &&
              !RELATION_TYPES.includes(args["relation-type"] as ObservationRelationType)
            ) {
              consola.error(
                `Invalid relation-type "${args["relation-type"]}". Must be one of: ${RELATION_TYPES.join(", ")}`,
              );
              process.exit(1);
            }
            if (
              args.description &&
              !["primary", "duplicate", "concat"].includes(args.description)
            ) {
              consola.error(
                "Invalid description strategy. Must be one of: primary, duplicate, concat",
              );
              process.exit(1);
            }

            const primaryId = parseId(args.primary, "primary");
            const duplicateId = parseId(args.duplicate, "duplicate");

            const relationConfidence = args["relation-confidence"]
              ? Number.parseInt(args["relation-confidence"], 10)
              : undefined;
            if (relationConfidence !== undefined) {
              if (
                !Number.isFinite(relationConfidence) ||
                relationConfidence < 0 ||
                relationConfidence > 100 ||
                !/^\d+$/.test(args["relation-confidence"]!)
              ) {
                consola.error("relation-confidence must be an integer between 0 and 100");
                process.exit(1);
              }
            }

            const obsxa = open(args.db);
            try {
              const result = obsxa.dedup.merge(primaryId, duplicateId, {
                confidenceStrategy: args.strategy as MergeConfidenceStrategy | undefined,
                relationType: args["relation-type"] as ObservationRelationType | undefined,
                relationConfidence,
                relationNotes: args["relation-notes"],
                mergeDescription: args.description as
                  | "primary"
                  | "duplicate"
                  | "concat"
                  | undefined,
              });
              if (args.toon || args.json) return output(result, args.toon);
              consola.success(
                `Merged #${result.merged.id} into #${result.primary.id}; frequency=${result.primary.frequency}`,
              );
            } finally {
              obsxa.close();
            }
          },
        }),
      ),
  },
});
