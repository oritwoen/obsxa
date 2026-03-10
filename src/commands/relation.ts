import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";
import { RELATION_TYPES } from "../types.ts";
import type { ObservationRelationType } from "../types.ts";

export default defineCommand({
  meta: { name: "relation", description: "Manage relations between observations" },
  subCommands: {
    add: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "add", description: "Add relation" },
          args: {
            ...dbArgs,
            from: { type: "string", required: true, description: "From observation ID" },
            to: { type: "string", required: true, description: "To observation ID" },
            type: { type: "string", required: true, description: RELATION_TYPES.join("|") },
            confidence: { type: "string", description: "Confidence 0-100 (default: 100)" },
            notes: { type: "string", description: "Optional relation notes" },
          },
          run({ args }) {
            if (!RELATION_TYPES.includes(args.type as ObservationRelationType)) {
              consola.error(
                `Invalid type "${args.type}". Must be one of: ${RELATION_TYPES.join(", ")}`,
              );
              process.exit(1);
            }
            if (args.from === args.to) {
              consola.error("Cannot create self-reference relation");
              process.exit(1);
            }
            const fromId = parseId(args.from, "from");
            const toId = parseId(args.to, "to");
            if (args.confidence && !/^\d+$/.test(args.confidence)) {
              consola.error(`--confidence must be an integer, got "${args.confidence}"`);
              process.exit(1);
            }
            const confidence = args.confidence ? Number(args.confidence) : undefined;
            if (
              confidence !== undefined &&
              (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)
            ) {
              consola.error("confidence must be between 0 and 100");
              process.exit(1);
            }

            const obsxa = open(args.db);
            try {
              const relation = obsxa.relation.add({
                fromObservationId: fromId,
                toObservationId: toId,
                type: args.type as ObservationRelationType,
                confidence,
                notes: args.notes,
              });
              if (args.toon || args.json) return output(relation, args.toon);
              consola.success(`Relation #${relation.id} added`);
            } finally {
              obsxa.close();
            }
          },
        }),
      ),
    list: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "list", description: "List relations for an observation" },
          args: {
            ...dbArgs,
            observation: { type: "string", required: true, description: "Observation ID" },
          },
          run({ args }) {
            const obsxa = open(args.db);
            try {
              const rows = obsxa.relation.list(parseId(args.observation, "observation"));
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No relations found.");
              for (const row of rows) {
                consola.log(
                  `#${row.id} ${row.fromObservationId} -[${row.type}; c=${row.confidence}]-> ${row.toObservationId}`,
                );
              }
            } finally {
              obsxa.close();
            }
          },
        }),
      ),
  },
});
