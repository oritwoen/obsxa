import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output } from "./_db.ts";

export default defineCommand({
  meta: { name: "project", description: "Manage projects" },
  subCommands: {
    add: defineCommand({
      meta: { name: "add", description: "Create a project" },
      args: {
        ...dbArgs,
        id: { type: "string", required: true, description: "Project ID" },
        name: { type: "string", required: true, description: "Project name" },
        description: { type: "string", description: "Project description" },
      },
      async run({ args }) {
        const obsxa = await open(args.db);
        try {
          const project = await obsxa.project.add({
            id: args.id,
            name: args.name,
            description: args.description,
          });
          if (args.toon || args.json) return output(project, args.toon);
          consola.success(`Project "${project.id}" created: ${project.name}`);
        } finally {
          await obsxa.close();
        }
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List projects" },
      args: dbArgs,
      async run({ args }) {
        const obsxa = await open(args.db);
        try {
          const projects = await obsxa.project.list();
          if (args.toon || args.json) return output(projects, args.toon);
          if (projects.length === 0) return consola.info("No projects found.");
          for (const project of projects) {
            consola.log(
              `${project.id}  ${project.name}${project.description ? ` (${project.description})` : ""}`,
            );
          }
        } finally {
          await obsxa.close();
        }
      },
    }),
  },
});
