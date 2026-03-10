import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";

export default defineCommand({
  meta: { name: "search", description: "Search observations" },
  args: {
    ...dbArgs,
    query: { type: "positional", required: true, description: "Search query" },
    project: { type: "string", description: "Project ID" },
    limit: { type: "string", description: "Max results" },
  },
  run({ args }) {
    const obsxa = open(args.db);
    try {
      const limit = args.limit ? parseId(args.limit, "limit") : undefined;
      if (limit !== undefined && limit < 1) {
        consola.error("--limit must be at least 1");
        process.exit(1);
      }
      const rows = obsxa.search.search(args.query, args.project, limit);
      if (args.toon || args.json) return output(rows, args.toon);
      if (rows.length === 0) return consola.info("No matches found.");
      for (const row of rows) {
        consola.log(`[${row.rank}] #${row.observation.id} ${row.observation.title}`);
      }
    } finally {
      obsxa.close();
    }
  },
});
