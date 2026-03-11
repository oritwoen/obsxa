import { describe, expect, it, vi } from "vitest";
import backupCommand from "../src/commands/backup.ts";
import { backupDatabase, restoreDatabase } from "../src/backup.ts";
import { output } from "../src/commands/_db.ts";

vi.mock("../src/backup.ts", () => ({
  backupDatabase: vi.fn(),
  restoreDatabase: vi.fn(),
}));

vi.mock("../src/commands/_db.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/_db.ts")>();
  return {
    ...actual,
    output: vi.fn(),
  };
});

async function loadSubcommand(name: "create" | "restore") {
  const factory = backupCommand.subCommands?.[name];
  if (!factory) throw new Error(`Missing ${name} subcommand`);
  return factory();
}

describe("backup command output parity", () => {
  it("supports TOON output for backup create", async () => {
    const result = { basePath: "/tmp/obsxa.db.bak", files: ["/tmp/obsxa.db.bak"] };
    vi.mocked(backupDatabase).mockReturnValue(result);

    const command = await loadSubcommand("create");
    await command.run?.({
      args: { db: "./obsxa.db", out: "/tmp/obsxa.db.bak", json: false, toon: true },
    });

    expect(output).toHaveBeenCalledWith(result, true);
  });

  it("supports TOON output for backup restore", async () => {
    const result = {
      restoredFrom: "/tmp/obsxa.db.bak",
      target: "./obsxa.db",
      files: ["./obsxa.db"],
      preRestoreBackup: null,
    };
    vi.mocked(restoreDatabase).mockReturnValue(result);

    const command = await loadSubcommand("restore");
    await command.run?.({
      args: { db: "./obsxa.db", from: "/tmp/obsxa.db.bak", json: false, toon: true },
    });

    expect(output).toHaveBeenCalledWith(result, true);
  });
});
