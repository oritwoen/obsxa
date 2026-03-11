import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output } from "./_db.ts";

export default defineCommand({
  meta: { name: "status", description: "Show project observation stats" },
  args: {
    ...dbArgs,
    projectId: { type: "positional", required: true, description: "Project ID" },
  },
  async run({ args }) {
    const obsxa = await open(args.db);
    try {
      const stats = await obsxa.analysis.stats(args.projectId);
      if (args.toon || args.json) return output(stats, args.toon);
      consola.log(
        `total=${stats.total} active=${stats.active} promoted=${stats.promoted} dismissed=${stats.dismissed} archived=${stats.archived} avgConfidence=${stats.avgConfidence} totalClusters=${stats.totalClusters}`,
      );
    } finally {
      await obsxa.close();
    }
  },
});
