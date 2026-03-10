import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export type ObsxaDB = BetterSQLite3Database;

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const observations = sqliteTable("observations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("pattern"),
  source: text("source").notNull(),
  sourceType: text("source_type").notNull().default("manual"),
  confidence: integer("confidence").notNull().default(50),
  frequency: integer("frequency").notNull().default(1),
  status: text("status").notNull().default("active"),
  promotedTo: text("promoted_to"),
  tags: text("tags").notNull().default("[]"),
  data: text("data"),
  context: text("context"),
  capturedAt: integer("captured_at", { mode: "timestamp" }),
  sourceRef: text("source_ref"),
  collector: text("collector"),
  inputHash: text("input_hash"),
  evidenceStrength: integer("evidence_strength").notNull().default(50),
  novelty: integer("novelty").notNull().default(50),
  uncertainty: integer("uncertainty").notNull().default(50),
  reproducibilityHint: text("reproducibility_hint"),
  triageScore: integer("triage_score").notNull().default(50),
  dismissedReasonCode: text("dismissed_reason_code"),
  archivedReasonCode: text("archived_reason_code"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const observationStatusEvents = sqliteTable("observation_status_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  observationId: integer("observation_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  reasonCode: text("reason_code").notNull(),
  reasonNote: text("reason_note"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const observationRelations = sqliteTable("observation_relations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromObservationId: integer("from_observation_id").notNull(),
  toObservationId: integer("to_observation_id").notNull(),
  type: text("type").notNull(),
  confidence: integer("confidence").notNull().default(100),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const duplicateCandidates = sqliteTable("duplicate_candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  primaryObservationId: integer("primary_observation_id").notNull(),
  duplicateObservationId: integer("duplicate_observation_id").notNull(),
  reason: text("reason").notNull(),
  score: integer("score").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const duplicateCandidateEvents = sqliteTable("duplicate_candidate_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  candidateId: integer("candidate_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const observationMerges = sqliteTable("observation_merges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  primaryObservationId: integer("primary_observation_id").notNull(),
  mergedObservationId: integer("merged_observation_id").notNull(),
  relationId: integer("relation_id"),
  confidenceStrategy: text("confidence_strategy").notNull(),
  summary: text("summary").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const clusters = sqliteTable("clusters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const observationEdits = sqliteTable("observation_edits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  observationId: integer("observation_id").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const clusterMembers = sqliteTable("cluster_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clusterId: integer("cluster_id").notNull(),
  observationId: integer("observation_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
