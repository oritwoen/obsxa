import { defineCommand } from "citty";
import { consola } from "consola";
import { dbArgs, open, output } from "./_db.ts";

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
          run({ args }) {
            const obsxa = open(args.db);
            try {
              const cluster = obsxa.cluster.add({
                projectId: args.project,
                name: args.name,
                description: args.description,
              });
              if (args.toon || args.json) return output(cluster, args.toon);
              consola.success(`Cluster #${cluster.id} created: ${cluster.name}`);
            } finally {
              obsxa.close();
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
          run({ args }) {
            const obsxa = open(args.db);
            try {
              const rows = obsxa.cluster.list(args.project);
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No clusters found.");
              for (const row of rows) {
                consola.log(
                  `#${row.id} ${row.name}${row.description ? ` (${row.description})` : ""}`,
                );
              }
            } finally {
              obsxa.close();
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
          run({ args }) {
            const obsxa = open(args.db);
            try {
              const member = obsxa.cluster.addMember(
                parseInt(args.cluster, 10),
                parseInt(args.observation, 10),
              );
              if (args.toon || args.json) return output(member, args.toon);
              consola.success(`Member #${member.id} added to cluster #${member.clusterId}`);
            } finally {
              obsxa.close();
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
          run({ args }) {
            const obsxa = open(args.db);
            try {
              const rows = obsxa.cluster.listMembers(parseInt(args.cluster, 10));
              if (args.toon || args.json) return output(rows, args.toon);
              if (rows.length === 0) return consola.info("No cluster members found.");
              for (const row of rows) {
                consola.log(`#${row.id} [${row.status}] ${row.title}`);
              }
            } finally {
              obsxa.close();
            }
          },
        }),
      ),
  },
});
