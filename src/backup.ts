import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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

  const restored: string[] = [];
  const targetFiles = companionPaths(target);

  for (let i = 0; i < sourceFiles.length; i += 1) {
    const sourceFile = sourceFiles[i];
    const targetFile = targetFiles[i];
    if (!sourceFile || !targetFile) continue;
    if (copyOptional(sourceFile, targetFile)) restored.push(targetFile);
  }

  if (restored.length === 0) {
    throw new Error(`No files restored from backup: ${fromBasePath}`);
  }

  return {
    restoredFrom: source,
    target,
    files: restored,
    preRestoreBackup,
  };
}
