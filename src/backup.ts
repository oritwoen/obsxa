import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

function companionPaths(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

function ensureParentDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function copyOptional(source: string, target: string): boolean {
  if (!existsSync(source)) return false;
  ensureParentDir(target);
  copyFileSync(source, target);
  return true;
}

export interface BackupResult {
  basePath: string;
  files: string[];
}

export interface RestoreResult {
  restoredFrom: string;
  target: string;
  files: string[];
  preRestoreBackup: string | null;
}

/**
 * Copy db/wal/shm files to a backup location.
 *
 * This performs file-level copies. If the database is actively being written to
 * by another process, the copied files may be inconsistent. For guaranteed
 * consistency, close the database connection before calling this function.
 */
export function backupDatabase(dbPath: string, outBasePath?: string): BackupResult {
  const basePath = outBasePath
    ? resolve(outBasePath)
    : resolve(
        dirname(dbPath),
        `${basename(dbPath)}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`,
      );

  const copied: string[] = [];
  const sources = companionPaths(resolve(dbPath));
  const targets = companionPaths(basePath);

  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    const target = targets[i];
    if (!source || !target) continue;
    if (copyOptional(source, target)) copied.push(target);
  }

  if (copied.length === 0) {
    throw new Error(`No database files found for backup: ${dbPath}`);
  }

  return { basePath, files: copied };
}

export function restoreDatabase(dbPath: string, fromBasePath: string): RestoreResult {
  const target = resolve(dbPath);
  const source = resolve(fromBasePath);

  const sourceFiles = companionPaths(source);
  if (!existsSync(sourceFiles[0]!)) {
    throw new Error(`Backup source not found: ${fromBasePath}`);
  }

  let preRestoreBackup: string | null = null;
  if (existsSync(target)) {
    const safety = `${target}.pre-restore.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    backupDatabase(target, safety);
    preRestoreBackup = safety;
  }

  const targetFiles = companionPaths(target);
  const staged: { tmp: string; final: string }[] = [];

  try {
    for (let i = 0; i < sourceFiles.length; i += 1) {
      const sourceFile = sourceFiles[i];
      const targetFile = targetFiles[i];
      if (!sourceFile || !targetFile) continue;
      if (!existsSync(sourceFile)) continue;
      const tmpFile = `${targetFile}.restoring`;
      ensureParentDir(tmpFile);
      copyFileSync(sourceFile, tmpFile);
      staged.push({ tmp: tmpFile, final: targetFile });
    }
  } catch (error) {
    for (const { tmp } of staged) {
      try {
        unlinkSync(tmp);
      } catch {}
    }
    throw error;
  }

  if (staged.length === 0) {
    throw new Error(`No files restored from backup: ${fromBasePath}`);
  }

  const restored: string[] = [];
  for (const { tmp, final } of staged) {
    renameSync(tmp, final);
    restored.push(final);
  }

  return {
    restoredFrom: source,
    target,
    files: restored,
    preRestoreBackup,
  };
}
