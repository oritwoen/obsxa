#!/usr/bin/env node
import { startMcpServer } from "obsxa/claude-code";

startMcpServer(process.argv.slice(2)).catch((err) => {
  console.error("[obsxa] Fatal:", err);
  process.exit(1);
});
