import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql/node";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createAnalysisStore } from "./core/analysis.ts";
import { createClusterStore } from "./core/cluster.ts";
import { createDedupStore } from "./core/dedup.ts";
import { createObservationStore } from "./core/observation.ts";
import { createProjectStore } from "./core/project.ts";
import { createRelationStore } from "./core/relation.ts";
import { createSearchStore } from "./core/search.ts";
import { backupDatabase } from "./backup.ts";
import type { ObsxaDB } from "./core/db.ts";
import type { ObsxaOptions } from "./types.ts";

const SCHEMA_VERSION = 1;

export type {
  AddCluster,
  AddObservation,
  AddRelation,
  CandidateReviewResult,
  Cluster,
  ClusterMember,
  CreateProject,
  DuplicateCandidate,
  DuplicateCandidateEvent,
  DuplicateCandidateStatus,
  MergeResult,
  Observation,
  ObservationBatchUpdateRecord,
  ObservationEdit,
  ObservationImportRecord,
  ObservationMerge,
  ObservationRelation,
  ObservationRelationType,
  ObservationStatusReasonCode,
  ObservationTransition,
  ObservationStatus,
  ObservationType,
  ObsxaOptions,
  Project,
  ProjectStats,
  ScanDuplicatesResult,
  SearchResult,
  SourceType,
  TriageRow,
  TriageSort,
  TransitionObservation,
  UpdateObservation,
} from "./types.ts";

function findMigrationsFolder(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let current = start;

  for (;;) {
    const candidate = resolve(current, "drizzle");
    if (existsSync(resolve(candidate, "meta/_journal.json"))) return candidate;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error("Cannot find drizzle migrations folder");
}

async function ensureMetaTable(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS obsxa_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

async function getSchemaVersion(client: Client): Promise<number | null> {
  const result = await client.execute({
    sql: "SELECT value FROM obsxa_meta WHERE key = ?",
    args: ["schema_version"],
  });
  const row = result.rows[0] as { value?: unknown } | undefined;
  if (!row?.value) return null;
  const parsed = Number.parseInt(String(row.value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function setSchemaVersion(client: Client, version: number): Promise<void> {
  await client.execute({
    sql: `INSERT INTO obsxa_meta (key, value, updated_at)
     VALUES (?, ?, strftime('%s', 'now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    args: ["schema_version", String(version)],
  });
}

function shouldBackup(dbPath: string, autoBackup: boolean): boolean {
  if (!autoBackup) return false;
  if (dbPath === ":memory:") return false;
  if (!existsSync(dbPath)) return false;
  try {
    return statSync(dbPath).size > 0;
  } catch {
    return false;
  }
}

function makeBackupPath(dbPath: string, backupDir?: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${basename(dbPath)}.bak.${stamp}`;
  if (backupDir) {
    mkdirSync(backupDir, { recursive: true });
    return join(backupDir, fileName);
  }
  return `${dbPath}.bak.${stamp}`;
}

function toLibsqlUrl(dbPath: string): string {
  if (dbPath === ":memory:") return dbPath;
  if (/^(?:file:|libsql:|https?:|wss?:)/.test(dbPath)) return dbPath;
  return `file:${dbPath}`;
}

const CUSTOM_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_observations_status ON observations(status)",
  "CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)",
  "CREATE INDEX IF NOT EXISTS idx_observations_source_type ON observations(source_type)",
  "CREATE INDEX IF NOT EXISTS idx_observations_triage ON observations(triage_score)",
  "CREATE INDEX IF NOT EXISTS idx_rel_from ON observation_relations(from_observation_id)",
  "CREATE INDEX IF NOT EXISTS idx_rel_to ON observation_relations(to_observation_id)",
  "CREATE INDEX IF NOT EXISTS idx_rel_type ON observation_relations(type)",
  "CREATE INDEX IF NOT EXISTS idx_observation_status_events_observation ON observation_status_events(observation_id)",
  "CREATE INDEX IF NOT EXISTS idx_clusters_project ON clusters(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_cluster_members_cluster ON cluster_members(cluster_id)",
  "CREATE INDEX IF NOT EXISTS idx_cluster_members_observation ON cluster_members(observation_id)",
  "CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_project ON duplicate_candidates(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_status ON duplicate_candidates(status)",
  "CREATE INDEX IF NOT EXISTS idx_duplicate_candidate_events_candidate ON duplicate_candidate_events(candidate_id)",
  "CREATE INDEX IF NOT EXISTS idx_observation_merges_project ON observation_merges(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_observation_edits_observation ON observation_edits(observation_id)",
];

const FTS_SQL = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title,
    description,
    tags,
    content='observations',
    content_rowid='id'
  )`,
  `CREATE TRIGGER IF NOT EXISTS observations_fts_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, description, tags)
    VALUES (NEW.id, NEW.title, NEW.description, NEW.tags);
  END`,
  `CREATE TRIGGER IF NOT EXISTS observations_fts_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, description, tags)
    VALUES('delete', OLD.id, OLD.title, OLD.description, OLD.tags);
  END`,
  `CREATE TRIGGER IF NOT EXISTS observations_fts_au AFTER UPDATE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, description, tags)
    VALUES('delete', OLD.id, OLD.title, OLD.description, OLD.tags);
    INSERT INTO observations_fts(rowid, title, description, tags)
    VALUES (NEW.id, NEW.title, NEW.description, NEW.tags);
  END`,
];

/** Observation database instance with all store modules attached. Call `.close()` when done. */
export interface ObsxaInstance {
  project: ReturnType<typeof createProjectStore>;
  observation: ReturnType<typeof createObservationStore>;
  relation: ReturnType<typeof createRelationStore>;
  cluster: ReturnType<typeof createClusterStore>;
  dedup: ReturnType<typeof createDedupStore>;
  search: ReturnType<typeof createSearchStore>;
  analysis: ReturnType<typeof createAnalysisStore>;
  close(): Promise<void>;
}

/**
 * Opens (or creates) an obsxa database and returns all store modules.
 *
 * Runs migrations automatically on first use or schema upgrade.
 * Backs up the database before migrating unless disabled.
 *
 * @example
 * ```ts
 * const obsxa = await createObsxa({ db: './research.db' })
 * await obsxa.observation.add({ projectId: 'my-project', title: 'Pattern found', source: 'scan' })
 * await obsxa.close()
 * ```
 */
export async function createObsxa(
  options: ObsxaOptions = { db: "./obsxa.db" },
): Promise<ObsxaInstance> {
  const resolved = {
    autoMigrate: options.autoMigrate ?? true,
    autoBackup: options.autoBackup ?? true,
    backupDir: options.backupDir,
  };

  const client = createClient({ url: toLibsqlUrl(options.db) });
  try {
    await client.execute("PRAGMA journal_mode = WAL");
  } catch {}
  try {
    await client.execute("PRAGMA foreign_keys = ON");
  } catch {}

  await ensureMetaTable(client);
  const beforeVersion = await getSchemaVersion(client);
  if (beforeVersion !== null && beforeVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${beforeVersion} is newer than supported ${SCHEMA_VERSION}. Upgrade obsxa package.`,
    );
  }

  const needsMigration = beforeVersion === null || beforeVersion < SCHEMA_VERSION;
  if (needsMigration && !resolved.autoMigrate) {
    throw new Error(
      `Database schema version ${beforeVersion ?? 0} requires migration to ${SCHEMA_VERSION}, but autoMigrate is disabled.`,
    );
  }

  if (needsMigration && shouldBackup(options.db, resolved.autoBackup)) {
    const backupPath = makeBackupPath(options.db, resolved.backupDir);
    backupDatabase(options.db, backupPath);
  }

  const db: ObsxaDB = drizzle({ client });
  if (needsMigration) {
    await migrate(db, { migrationsFolder: findMigrationsFolder() });
    await setSchemaVersion(client, SCHEMA_VERSION);
  }

  for (const statement of CUSTOM_SQL) {
    await client.execute(statement);
  }
  try {
    for (const statement of FTS_SQL) {
      await client.execute(statement);
    }
  } catch {}

  return {
    project: createProjectStore(db),
    observation: createObservationStore(db),
    relation: createRelationStore(db),
    cluster: createClusterStore(db),
    dedup: createDedupStore(db),
    search: createSearchStore(client),
    analysis: createAnalysisStore(db),

    async close() {
      client.close();
    },
  };
}
