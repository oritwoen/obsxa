import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output } from "./_db.ts";

export default defineCommand({
  meta: { name: "unpromoted", description: "List active unpromoted observations" },
  args: {
    ...dbArgs,
    projectId: { type: "positional", required: true, description: "Project ID" },
  },
  run({ args }) {
    const obsxa = open(args.db);
    try {
      const rows = obsxa.analysis.unpromoted(args.projectId);
      if (args.toon || args.json) return output(rows, args.toon);
      if (rows.length === 0) return consola.info("No unpromoted observations found.");
      for (const row of rows) {
        consola.log(`#${row.id} ${row.title}`);
      }
    } finally {
      obsxa.close();
    }
  },
});
