import type Database from "better-sqlite3";
import { parseTags } from "./mappers.ts";
import type {
  Observation,
  ObservationStatus,
  ObservationType,
  SearchResult,
  SourceType,
} from "../types.ts";

function rowToObservation(row: Record<string, unknown>): Observation {
  return {
    id: row.id as number,
    projectId: row.project_id as string,
    title: row.title as string,
    description: row.description as string | null,
    type: row.type as ObservationType,
    source: row.source as string,
    sourceType: row.source_type as SourceType,
    confidence: row.confidence as number,
    frequency: row.frequency as number,
    status: row.status as ObservationStatus,
    promotedTo: row.promoted_to as string | null,
    tags: parseTags(row.tags),
    data: row.data as string | null,
    context: (row.context as string | null) ?? null,
    capturedAt: row.captured_at ? new Date((row.captured_at as number) * 1000) : null,
    sourceRef: (row.source_ref as string | null) ?? null,
    collector: (row.collector as string | null) ?? null,
    inputHash: (row.input_hash as string | null) ?? null,
    evidenceStrength: (row.evidence_strength as number) ?? 50,
    novelty: (row.novelty as number) ?? 50,
    uncertainty: (row.uncertainty as number) ?? 50,
    reproducibilityHint: (row.reproducibility_hint as string | null) ?? null,
    triageScore: (row.triage_score as number) ?? 50,
    dismissedReasonCode: (row.dismissed_reason_code as Observation["dismissedReasonCode"]) ?? null,
    archivedReasonCode: (row.archived_reason_code as Observation["archivedReasonCode"]) ?? null,
    createdAt: new Date((row.created_at as number) * 1000),
    updatedAt: row.updated_at ? new Date((row.updated_at as number) * 1000) : null,
  };
}

export function createSearchStore(sqlite: Database.Database) {
  return {
    search(query: string, projectId?: string, limit = 50): SearchResult[] {
      try {
        let sql = `
          SELECT o.*, fts.rank
          FROM observations o
          JOIN observations_fts fts ON o.id = fts.rowid
          WHERE observations_fts MATCH ?
        `;
        const params: unknown[] = [query];

        if (projectId) {
          sql += " AND o.project_id = ?";
          params.push(projectId);
        }

        sql += " ORDER BY fts.rank LIMIT ?";
        params.push(limit);

        const rows = sqlite.prepare(sql).all(...params) as Record<string, unknown>[];
        return rows.map((row, index) => ({ observation: rowToObservation(row), rank: index + 1 }));
      } catch {
        let sql = `
          SELECT *
          FROM observations
          WHERE (title LIKE ? OR description LIKE ? OR tags LIKE ?)
        `;
        const like = `%${query}%`;
        const params: unknown[] = [like, like, like];

        if (projectId) {
          sql += " AND project_id = ?";
          params.push(projectId);
        }

        sql += " ORDER BY created_at DESC LIMIT ?";
        params.push(limit);

        const rows = sqlite.prepare(sql).all(...params) as Record<string, unknown>[];
        return rows.map((row, index) => ({ observation: rowToObservation(row), rank: index + 1 }));
      }
    },
  };
}
