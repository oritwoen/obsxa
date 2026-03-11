import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";

export default defineCommand({
  meta: { name: "promote", description: "Promote observation to hypothesis candidate" },
  args: {
    ...dbArgs,
    id: { type: "positional", required: true, description: "Observation ID" },
    ref: {
      type: "string",
      required: true,
      description: "Hypothesis reference (e.g. hypxa:project:3)",
    },
  },
  async run({ args }) {
    const obsxa = await open(args.db);
    try {
      const id = parseId(args.id, "id");
      const observation = await obsxa.observation.get(id);
      if (!observation) {
        consola.error(`Observation #${id} not found`);
        process.exit(1);
      }
      if (observation.status !== "active") {
        consola.error(
          `Observation #${id} must be active to promote (current: ${observation.status})`,
        );
        process.exit(1);
      }

      const result = await obsxa.observation.promote(id, args.ref);
      if (args.toon || args.json) return output(result, args.toon);
      consola.success(`Observation #${result.id} promoted to ${result.promotedTo}`);
    } finally {
      await obsxa.close();
    }
  },
});
