#!/usr/bin/env node
import { runHookCli } from "obsxa/claude-code-hooks";

runHookCli(process.argv.slice(2)).catch((err) => {
  console.error("[obsxa] Hook error:", err);
  process.exit(1);
});
