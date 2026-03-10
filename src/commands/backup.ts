import { defineCommand } from "citty";
import { consola } from "consola";
import { backupDatabase, restoreDatabase } from "../backup.ts";

export default defineCommand({
  meta: { name: "backup", description: "Backup or restore obsxa SQLite database files" },
  subCommands: {
    create: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "create", description: "Create database backup (db, wal, shm)" },
          args: {
            db: { type: "string", default: "./obsxa.db", description: "Path to SQLite database" },
            out: { type: "string", description: "Backup base path (without -wal/-shm suffixes)" },
            json: { type: "boolean", default: false, description: "Output as JSON" },
          },
          run({ args }) {
            try {
              const result = backupDatabase(args.db, args.out);
              if (args.json) {
                process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
                return;
              }
              consola.success(`Backup created: ${result.basePath}`);
            } catch (err) {
              consola.error(`Backup failed: ${(err as Error).message}`);
              process.exit(1);
            }
          },
        }),
      ),

    restore: () =>
      Promise.resolve(
        defineCommand({
          meta: { name: "restore", description: "Restore database from backup base path" },
          args: {
            db: {
              type: "string",
              default: "./obsxa.db",
              description: "Target SQLite database path",
            },
            from: {
              type: "string",
              required: true,
              description: "Backup base path to restore from",
            },
            json: { type: "boolean", default: false, description: "Output as JSON" },
          },
          run({ args }) {
            try {
              const result = restoreDatabase(args.db, args.from);
              if (args.json) {
                process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
                return;
              }
              consola.success(`Database restored from: ${result.restoredFrom}`);
              if (result.preRestoreBackup) {
                consola.info(`Pre-restore safety backup: ${result.preRestoreBackup}`);
              }
            } catch (err) {
              consola.error(`Restore failed: ${(err as Error).message}`);
              process.exit(1);
            }
          },
        }),
      ),
  },
});
