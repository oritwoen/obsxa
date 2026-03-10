#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "obsxa",
    version: "0.0.1",
    description: "Structured observation management for research agents",
  },
  subCommands: {
    backup: () => import("./commands/backup.ts").then((m) => m.default),
    project: () => import("./commands/project.ts").then((m) => m.default),
    observation: () => import("./commands/observation.ts").then((m) => m.default),
    promote: () => import("./commands/promote.ts").then((m) => m.default),
    relation: () => import("./commands/relation.ts").then((m) => m.default),
    dedup: () => import("./commands/dedup.ts").then((m) => m.default),
    cluster: () => import("./commands/cluster.ts").then((m) => m.default),
    search: () => import("./commands/search.ts").then((m) => m.default),
    status: () => import("./commands/status.ts").then((m) => m.default),
    triage: () => import("./commands/triage.ts").then((m) => m.default),
    frequent: () => import("./commands/frequent.ts").then((m) => m.default),
    unpromoted: () => import("./commands/unpromoted.ts").then((m) => m.default),
  },
});

await runMain(main);
