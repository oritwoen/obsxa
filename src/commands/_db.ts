import { encode } from "@toon-format/toon";
import { consola } from "consola";
import { createObsxa } from "../index.ts";

export const dbArgs = {
  db: { type: "string" as const, description: "Path to SQLite database", default: "./obsxa.db" },
  json: { type: "boolean" as const, description: "Output as JSON", default: false },
  toon: { type: "boolean" as const, description: "Output as TOON", default: false },
};

export function open(dbPath: string) {
  return createObsxa({ db: dbPath });
}

export function parseId(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    consola.error(`--${name} must be a positive integer, got "${value}"`);
    process.exit(1);
  }
  return Number(value);
}

export function output(data: unknown, toon = false) {
  process.stdout.write(toon ? encode(data) + "\n" : JSON.stringify(data, null, 2) + "\n");
}
