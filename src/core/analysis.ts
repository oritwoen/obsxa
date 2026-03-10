import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import { clusters, observationRelations, observations } from "./db.ts";
import type { ObsxaDB } from "./db.ts";
import { toObservation } from "./mappers.ts";
import type { Observation, ProjectStats, TriageRow } from "../types.ts";

export function createAnalysisStore(db: ObsxaDB) {
  return {
    stats(projectId: string): ProjectStats {
      const rows = db
        .select()
        .from(observations)
        .where(eq(observations.projectId, projectId))
        .all();

      const total = rows.length;
      const active = rows.filter((row) => row.status === "active").length;
      const promoted = rows.filter((row) => row.status === "promoted").length;
      const dismissed = rows.filter((row) => row.status === "dismissed").length;
      const archived = rows.filter((row) => row.status === "archived").length;
      const avgConfidence =
        total > 0 ? Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / total) : 0;

      const totalClusters = db
        .select({ id: clusters.id })
        .from(clusters)
        .where(eq(clusters.projectId, projectId))
        .all().length;

      return {
        total,
        active,
        promoted,
        dismissed,
        archived,
        avgConfidence,
        totalClusters,
        byType: {
          pattern: rows.filter((row) => row.type === "pattern").length,
          anomaly: rows.filter((row) => row.type === "anomaly").length,
          measurement: rows.filter((row) => row.type === "measurement").length,
          correlation: rows.filter((row) => row.type === "correlation").length,
          artifact: rows.filter((row) => row.type === "artifact").length,
        },
      };
    },

    frequent(projectId: string): Observation[] {
      return db
        .select()
        .from(observations)
        .where(
          and(eq(observations.projectId, projectId), notInArray(observations.frequency, [0, 1])),
        )
        .all()
        .map(toObservation)
        .sort((a, b) => b.frequency - a.frequency);
    },

    isolated(projectId: string): Observation[] {
      const projectObservations = db
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.projectId, projectId))
        .all();
      const ids = projectObservations.map((row) => row.id);
      if (ids.length === 0) return [];

      const relationRows = db
        .select({
          fromObservationId: observationRelations.fromObservationId,
          toObservationId: observationRelations.toObservationId,
        })
        .from(observationRelations)
        .where(
          or(
            inArray(observationRelations.fromObservationId, ids),
            inArray(observationRelations.toObservationId, ids),
          ),
        )
        .all();

      const relatedIds = new Set<number>();
      for (const row of relationRows) {
        relatedIds.add(row.fromObservationId);
        relatedIds.add(row.toObservationId);
      }

      return db
        .select()
        .from(observations)
        .where(eq(observations.projectId, projectId))
        .all()
        .filter((row) => !relatedIds.has(row.id))
        .map(toObservation);
    },

    convergent(projectId: string): Observation[] {
      const allObs = db
        .select()
        .from(observations)
        .where(eq(observations.projectId, projectId))
        .all();
      if (allObs.length === 0) return [];

      const byId = new Map(allObs.map((o) => [o.id, o]));
      const ids = allObs.map((o) => o.id);

      const supports = db
        .select()
        .from(observationRelations)
        .where(
          and(
            eq(observationRelations.type, "supports"),
            inArray(observationRelations.toObservationId, ids),
          ),
        )
        .all();

      const toSources = new Map<number, Set<string>>();
      for (const relation of supports) {
        const from = byId.get(relation.fromObservationId);
        const to = byId.get(relation.toObservationId);
        if (!from || !to) continue;
        const existing = toSources.get(to.id) ?? new Set<string>();
        existing.add(from.source);
        toSources.set(to.id, existing);
      }

      return allObs
        .filter((observation) => (toSources.get(observation.id)?.size ?? 0) >= 2)
        .map(toObservation);
    },

    promoted(projectId: string): Observation[] {
      return db
        .select()
        .from(observations)
        .where(and(eq(observations.projectId, projectId), eq(observations.status, "promoted")))
        .all()
        .map(toObservation);
    },

    unpromoted(projectId: string): Observation[] {
      return db
        .select()
        .from(observations)
        .where(and(eq(observations.projectId, projectId), eq(observations.status, "active")))
        .all()
        .filter((row) => row.promotedTo === null)
        .map(toObservation);
    },

    triage(projectId: string, limit = 25, sort: "triage" | "recent" = "triage"): TriageRow[] {
      const activeRows = db
        .select()
        .from(observations)
        .where(and(eq(observations.projectId, projectId), eq(observations.status, "active")))
        .all();

      const ids = activeRows.map((row) => row.id);
      if (ids.length === 0) return [];

      const relations = db
        .select()
        .from(observationRelations)
        .where(
          and(
            inArray(observationRelations.toObservationId, ids),
            or(
              eq(observationRelations.type, "supports"),
              eq(observationRelations.type, "contradicts"),
            ),
          ),
        )
        .all();

      const supportsCount = new Map<number, number>();
      const contradictsCount = new Map<number, number>();

      for (const relation of relations) {
        if (relation.type === "supports") {
          supportsCount.set(
            relation.toObservationId,
            (supportsCount.get(relation.toObservationId) ?? 0) + 1,
          );
        }
        if (relation.type === "contradicts") {
          contradictsCount.set(
            relation.toObservationId,
            (contradictsCount.get(relation.toObservationId) ?? 0) + 1,
          );
        }
      }

      const rows = activeRows.map((row) => {
        const supports = supportsCount.get(row.id) ?? 0;
        const contradicts = contradictsCount.get(row.id) ?? 0;
        const score = row.triageScore + supports * 7 + contradicts * 12;
        return {
          observation: toObservation(row),
          score,
          supports,
          contradicts,
        };
      });

      rows.sort((a, b) => {
        if (sort === "recent") {
          return b.observation.createdAt.getTime() - a.observation.createdAt.getTime();
        }
        return b.score - a.score;
      });

      return rows.slice(0, Math.max(1, limit));
    },
  };
}
