import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output, parseId } from "./_db.ts";

export default defineCommand({
  meta: { name: "cluster", description: "Manage observation clusters" },
  subCommands: {
    add: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "add", description: "Add cluster" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
            name: { type: "string", required: true, description: "Cluster name" },
            description: { type: "string", description: "Cluster description" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const cluster = await obsxa.cluster.add({
                projectId: args.project,
                name: args.name,
                description: args.description,
              });
              if (args.toon || args.json) return output(cluster, args.toon);
              consola.success(`Cluster #${cluster.id} created: ${cluster.name}`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),
    list: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "list", description: "List clusters" },
          args: {
            ...dbArgs,
            project: { type: "string", required: true, description: "Project ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const rows = await obsxa.cluster.list(args.project);
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No clusters found.");
              for (const row of rows) {
                consola.log(
                  `#${row.id} ${row.name}${row.description ? ` (${row.description})` : ""}`,
                );
              }
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),
    member: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "member", description: "Add cluster member" },
          args: {
            ...dbArgs,
            cluster: { type: "string", required: true, description: "Cluster ID" },
            observation: { type: "string", required: true, description: "Observation ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const member = await obsxa.cluster.addMember(
                parseId(args.cluster, "cluster"),
                parseId(args.observation, "observation"),
              );
              if (args.toon || args.json) return output(member, args.toon);
              consola.success(`Member #${member.id} added to cluster #${member.clusterId}`);
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),
    members: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "members", description: "List cluster members" },
          args: {
            ...dbArgs,
            cluster: { type: "string", required: true, description: "Cluster ID" },
          },
          async run({ args }) {
            const obsxa = await open(args.db);
            try {
              const rows = await obsxa.cluster.listMembers(parseId(args.cluster, "cluster"));
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No cluster members found.");
              for (const row of rows) {
                consola.log(`#${row.id} [${row.status}] ${row.title}`);
              }
            } finally {
              await obsxa.close();
            }
          },
        }),
      ),
  },
});
