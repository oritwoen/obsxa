import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";
import type { TriageSort } from "../types.ts";

const sortModes: TriageSort[] = ["triage", "recent"];

export default defineCommand({
  meta: { name: "triage", description: "Rank active observations for review priority" },
  args: {
    ...dbArgs,
    project: { type: "positional", required: true, description: "Project ID" },
    limit: { type: "string", description: "Max rows (default: 25)" },
    sort: { type: "string", description: "triage|recent (default: triage)" },
  },
  run({ args }) {
    const sort = (args.sort ?? "triage") as TriageSort;
    if (!sortModes.includes(sort)) {
      consola.error(`Invalid sort "${sort}". Must be one of: ${sortModes.join(", ")}`);
      process.exit(1);
    }

    const obsxa = open(args.db);
    try {
      const limit = args.limit ? parseId(args.limit, "limit") : 25;
      if (limit < 1) {
        consola.error("--limit must be at least 1");
        process.exit(1);
      }
      const rows = obsxa.analysis.triage(args.project, limit, sort);
      if (args.toon || args.json) return output(rows, args.toon);
      if (rows.length === 0) return consola.info("No active observations found.");
      for (const row of rows) {
        consola.log(
          `#${row.observation.id} score=${row.score} supports=${row.supports} contradicts=${row.contradicts} ${row.observation.title}`,
        );
      }
    } finally {
      obsxa.close();
    }
  },
});
