import { and, eq, or, sql } from "drizzle-orm";
import {
  clusterMembers,
  duplicateCandidateEvents,
  duplicateCandidates,
  observationMerges,
  observationRelations,
  observationStatusEvents,
  observations,
} from "./db.ts";
import type { ObsxaDB } from "./db.ts";
import { computeTriageScore, toObservation, toRelation } from "./mappers.ts";
import type {
  CandidateReviewResult,
  DuplicateCandidateEvent,
  DuplicateCandidate,
  DuplicateCandidateStatus,
  MergeConfidenceStrategy,
  MergeOptions,
  MergeResult,
  Observation,
  ObservationRelation,
  ScanDuplicatesResult,
} from "../types.ts";

function toCandidateEvent(
  row: typeof duplicateCandidateEvents.$inferSelect,
): DuplicateCandidateEvent {
  return {
    id: row.id,
    candidateId: row.candidateId,
    fromStatus: row.fromStatus as DuplicateCandidateStatus,
    toStatus: row.toStatus as DuplicateCandidateStatus,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

function toCandidate(row: typeof duplicateCandidates.$inferSelect): DuplicateCandidate {
  return {
    id: row.id,
    projectId: row.projectId,
    primaryObservationId: row.primaryObservationId,
    duplicateObservationId: row.duplicateObservationId,
    reason: row.reason,
    score: row.score / 1000,
    status: row.status as DuplicateCandidateStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMerge(row: typeof observationMerges.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    primaryObservationId: row.primaryObservationId,
    mergedObservationId: row.mergedObservationId,
    relationId: row.relationId,
    confidenceStrategy: row.confidenceStrategy as MergeConfidenceStrategy,
    summary: row.summary,
    createdAt: row.createdAt,
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(value: string): Set<string> {
  return new Set(value.split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function trigrams(value: string): Set<string> {
  const s = value.replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i <= s.length - 3; i++) {
    result.add(s.slice(i, i + 3));
  }
  return result;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function makeFingerprint(observation: Observation): string {
  const tags = [...observation.tags]
    .map((tag) => normalize(tag))
    .sort()
    .join("|");
  return [
    normalize(observation.title),
    normalize(observation.description),
    normalize(observation.type),
    normalize(observation.sourceType),
    tags,
  ].join("::");
}

function pairKey(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

function mergeConfidence(
  primary: number,
  duplicate: number,
  strategy: MergeConfidenceStrategy,
): number {
  if (strategy === "primary") return primary;
  if (strategy === "average") return Math.round((primary + duplicate) / 2);
  return Math.max(primary, duplicate);
}

export function createDedupStore(db: ObsxaDB) {
  return {
    async scan(projectId: string, threshold = 0.72): Promise<ScanDuplicatesResult> {
      const rows = (
        await db.select().from(observations).where(eq(observations.projectId, projectId)).all()
      ).map(toObservation);

      const results: DuplicateCandidate[] = [];
      let checkedPairs = 0;

      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          checkedPairs += 1;
          const left = rows[i];
          const right = rows[j];
          if (!left || !right) continue;

          const [primaryId, duplicateId] = pairKey(left.id, right.id);
          const primary = primaryId === left.id ? left : right;
          const duplicate = duplicateId === right.id ? right : left;

          const leftFingerprint = makeFingerprint(left);
          const rightFingerprint = makeFingerprint(right);

          let score = 0;
          let reason: string | null = null;

          if (left.sourceRef && right.sourceRef && left.sourceRef === right.sourceRef) {
            score = 1;
            reason = "exact_source_ref";
          } else if (leftFingerprint === rightFingerprint) {
            score = 1;
            reason = "exact_fingerprint";
          } else {
            const titleTokens = jaccard(
              tokenize(normalize(left.title)),
              tokenize(normalize(right.title)),
            );
            const titleTrigrams = jaccard(
              trigrams(normalize(left.title)),
              trigrams(normalize(right.title)),
            );
            const titleScore = Math.max(titleTokens, titleTrigrams);

            const descTokens = jaccard(
              tokenize(normalize(left.description)),
              tokenize(normalize(right.description)),
            );
            const descTrigrams = jaccard(
              trigrams(normalize(left.description)),
              trigrams(normalize(right.description)),
            );
            const descriptionScore = Math.max(descTokens, descTrigrams);

            const tagScore = jaccard(
              new Set(left.tags.map(normalize)),
              new Set(right.tags.map(normalize)),
            );
            const typeScore = left.type === right.type ? 1 : 0;
            const sourceTypeScore = left.sourceType === right.sourceType ? 1 : 0;

            const refBoost =
              left.sourceRef &&
              right.sourceRef &&
              normalize(left.sourceRef) === normalize(right.sourceRef)
                ? 0.15
                : 0;
            score =
              titleScore * 0.4 +
              descriptionScore * 0.25 +
              tagScore * 0.15 +
              typeScore * 0.05 +
              sourceTypeScore * 0.05 +
              refBoost;

            if (score >= threshold) reason = "near_text";
          }

          if (!reason) continue;

          const storedScore = Math.round(score * 1000);
          const existing = await db
            .select()
            .from(duplicateCandidates)
            .where(
              and(
                eq(duplicateCandidates.primaryObservationId, primary.id),
                eq(duplicateCandidates.duplicateObservationId, duplicate.id),
              ),
            )
            .get();

          if (existing) {
            const updated = await db
              .update(duplicateCandidates)
              .set({
                reason,
                score: storedScore,
                updatedAt: new Date(),
              })
              .where(eq(duplicateCandidates.id, existing.id))
              .returning()
              .get();
            results.push(toCandidate(updated));
            continue;
          }

          const inserted = await db
            .insert(duplicateCandidates)
            .values({
              projectId,
              primaryObservationId: primary.id,
              duplicateObservationId: duplicate.id,
              reason,
              score: storedScore,
              status: "open",
            })
            .returning()
            .get();
          results.push(toCandidate(inserted));
        }
      }

      return { candidates: results.sort((a, b) => b.score - a.score), checkedPairs };
    },

    async candidates(
      projectId: string,
      status: DuplicateCandidateStatus | "all" = "open",
    ): Promise<DuplicateCandidate[]> {
      if (status === "all") {
        return (
          await db
            .select()
            .from(duplicateCandidates)
            .where(eq(duplicateCandidates.projectId, projectId))
            .all()
        )
          .map(toCandidate)
          .sort((a, b) => b.score - a.score);
      }

      return (
        await db
          .select()
          .from(duplicateCandidates)
          .where(
            and(
              eq(duplicateCandidates.projectId, projectId),
              eq(duplicateCandidates.status, status),
            ),
          )
          .all()
      )
        .map(toCandidate)
        .sort((a, b) => b.score - a.score);
    },

    async review(
      candidateId: number,
      status: DuplicateCandidateStatus,
      reason: string,
    ): Promise<CandidateReviewResult> {
      const current = await db
        .select()
        .from(duplicateCandidates)
        .where(eq(duplicateCandidates.id, candidateId))
        .get();
      if (!current) throw new Error(`Duplicate candidate #${candidateId} not found`);
      if (current.status === status)
        throw new Error(`Candidate #${candidateId} is already ${status}`);

      const updated = await db
        .update(duplicateCandidates)
        .set({ status, updatedAt: new Date() })
        .where(eq(duplicateCandidates.id, candidateId))
        .returning()
        .get();

      const event = await db
        .insert(duplicateCandidateEvents)
        .values({
          candidateId,
          fromStatus: current.status,
          toStatus: status,
          reason,
        })
        .returning()
        .get();

      return {
        candidate: toCandidate(updated),
        event: toCandidateEvent(event),
      };
    },

    async merge(
      primaryObservationId: number,
      duplicateObservationId: number,
      options: MergeOptions = {},
    ): Promise<MergeResult> {
      if (primaryObservationId === duplicateObservationId) {
        throw new Error("Cannot merge observation into itself");
      }

      return db.transaction(async (tx) => {
        const primaryRow = await tx
          .select()
          .from(observations)
          .where(eq(observations.id, primaryObservationId))
          .get();
        const duplicateRow = await tx
          .select()
          .from(observations)
          .where(eq(observations.id, duplicateObservationId))
          .get();
        if (!primaryRow) throw new Error(`Observation #${primaryObservationId} not found`);
        if (!duplicateRow) throw new Error(`Observation #${duplicateObservationId} not found`);
        if (primaryRow.projectId !== duplicateRow.projectId) {
          throw new Error("Cannot merge observations across different projects");
        }

        const primary = toObservation(primaryRow);
        const duplicate = toObservation(duplicateRow);
        const confidenceStrategy = options.confidenceStrategy ?? "max";
        const mergedConfidence = mergeConfidence(
          primary.confidence,
          duplicate.confidence,
          confidenceStrategy,
        );
        const mergedTags = Array.from(new Set([...primary.tags, ...duplicate.tags]));
        const mergedFrequency = primary.frequency + duplicate.frequency;

        let description = primary.description;
        const mergeDescription = options.mergeDescription ?? "concat";
        if (mergeDescription === "duplicate") description = duplicate.description;
        if (mergeDescription === "concat") {
          const parts = [primary.description, duplicate.description].filter(Boolean);
          description = parts.length > 0 ? parts.join("\n\n---\n\n") : null;
        }

        const promotedTo = primary.promotedTo ?? duplicate.promotedTo;
        const data = primary.data ?? duplicate.data;
        const triageScore = computeTriageScore({
          confidence: mergedConfidence,
          evidenceStrength: Math.max(primary.evidenceStrength, duplicate.evidenceStrength),
          novelty: Math.max(primary.novelty, duplicate.novelty),
          uncertainty: Math.min(primary.uncertainty, duplicate.uncertainty),
          frequency: mergedFrequency,
        });

        const updatedPrimaryRow = await tx
          .update(observations)
          .set({
            description,
            confidence: mergedConfidence,
            frequency: mergedFrequency,
            tags: JSON.stringify(mergedTags),
            promotedTo,
            data,
            triageScore,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, primaryObservationId))
          .returning()
          .get();

        await tx
          .update(observations)
          .set({
            status: "archived",
            archivedReasonCode: "merged",
            dismissedReasonCode: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, duplicateObservationId))
          .run();

        await tx
          .insert(observationStatusEvents)
          .values({
            observationId: duplicateObservationId,
            fromStatus: duplicate.status,
            toStatus: "archived",
            reasonCode: "merged",
            reasonNote: `Merged into #${primaryObservationId}`,
          })
          .run();

        const primaryFromRelations = await tx
          .select({
            to: observationRelations.toObservationId,
            type: observationRelations.type,
          })
          .from(observationRelations)
          .where(eq(observationRelations.fromObservationId, primaryObservationId))
          .all();
        const primaryToRelations = await tx
          .select({
            from: observationRelations.fromObservationId,
            type: observationRelations.type,
          })
          .from(observationRelations)
          .where(eq(observationRelations.toObservationId, primaryObservationId))
          .all();

        const primaryFromKeys = new Set(primaryFromRelations.map((r) => `${r.to}:${r.type}`));
        const primaryToKeys = new Set(primaryToRelations.map((r) => `${r.from}:${r.type}`));

        const duplicateFromRelations = await tx
          .select({
            id: observationRelations.id,
            to: observationRelations.toObservationId,
            type: observationRelations.type,
          })
          .from(observationRelations)
          .where(eq(observationRelations.fromObservationId, duplicateObservationId))
          .all();
        const duplicateToRelations = await tx
          .select({
            id: observationRelations.id,
            from: observationRelations.fromObservationId,
            type: observationRelations.type,
          })
          .from(observationRelations)
          .where(eq(observationRelations.toObservationId, duplicateObservationId))
          .all();

        for (const rel of duplicateFromRelations) {
          if (primaryFromKeys.has(`${rel.to}:${rel.type}`)) {
            await tx.delete(observationRelations).where(eq(observationRelations.id, rel.id)).run();
          }
        }
        for (const rel of duplicateToRelations) {
          if (primaryToKeys.has(`${rel.from}:${rel.type}`)) {
            await tx.delete(observationRelations).where(eq(observationRelations.id, rel.id)).run();
          }
        }

        await tx
          .update(observationRelations)
          .set({ fromObservationId: primaryObservationId })
          .where(eq(observationRelations.fromObservationId, duplicateObservationId))
          .run();

        await tx
          .update(observationRelations)
          .set({ toObservationId: primaryObservationId })
          .where(eq(observationRelations.toObservationId, duplicateObservationId))
          .run();

        await tx
          .delete(observationRelations)
          .where(
            sql`${observationRelations.fromObservationId} = ${observationRelations.toObservationId}`,
          )
          .run();

        const relationRows = await tx
          .select()
          .from(observationRelations)
          .where(
            or(
              eq(observationRelations.fromObservationId, primaryObservationId),
              eq(observationRelations.toObservationId, primaryObservationId),
            ),
          )
          .all();
        const seen = new Set<string>();
        for (const relationRow of relationRows) {
          const key = `${relationRow.fromObservationId}:${relationRow.toObservationId}:${relationRow.type}`;
          if (seen.has(key)) {
            await tx
              .delete(observationRelations)
              .where(eq(observationRelations.id, relationRow.id))
              .run();
            continue;
          }
          seen.add(key);
        }

        const duplicateMemberships = await tx
          .select()
          .from(clusterMembers)
          .where(eq(clusterMembers.observationId, duplicateObservationId))
          .all();
        for (const member of duplicateMemberships) {
          const existingPrimaryMembership = await tx
            .select()
            .from(clusterMembers)
            .where(
              and(
                eq(clusterMembers.clusterId, member.clusterId),
                eq(clusterMembers.observationId, primaryObservationId),
              ),
            )
            .get();
          if (!existingPrimaryMembership) {
            await tx
              .update(clusterMembers)
              .set({ observationId: primaryObservationId })
              .where(eq(clusterMembers.id, member.id))
              .run();
          } else {
            await tx.delete(clusterMembers).where(eq(clusterMembers.id, member.id)).run();
          }
        }

        const relationType = options.relationType ?? "duplicate_of";
        const relationConfidence = options.relationConfidence ?? 100;
        const relationNotes = options.relationNotes ?? `Merged into #${primaryObservationId}`;
        let relation: ObservationRelation | null = null;

        const existingRelation = await tx
          .select()
          .from(observationRelations)
          .where(
            and(
              eq(observationRelations.fromObservationId, duplicateObservationId),
              eq(observationRelations.toObservationId, primaryObservationId),
              eq(observationRelations.type, relationType),
            ),
          )
          .get();

        const relationRow = existingRelation
          ? await tx
              .update(observationRelations)
              .set({ confidence: relationConfidence, notes: relationNotes })
              .where(eq(observationRelations.id, existingRelation.id))
              .returning()
              .get()
          : await tx
              .insert(observationRelations)
              .values({
                fromObservationId: duplicateObservationId,
                toObservationId: primaryObservationId,
                type: relationType,
                confidence: relationConfidence,
                notes: relationNotes,
              })
              .returning()
              .get();

        relation = toRelation(relationRow);

        const summary = JSON.stringify({
          mergedFrequency,
          mergedTagsCount: mergedTags.length,
          confidenceStrategy,
        });
        const mergeRow = await tx
          .insert(observationMerges)
          .values({
            projectId: primary.projectId,
            primaryObservationId,
            mergedObservationId: duplicateObservationId,
            relationId: relation?.id ?? null,
            confidenceStrategy,
            summary,
          })
          .returning()
          .get();

        const relatedCandidates = await tx
          .select()
          .from(duplicateCandidates)
          .where(
            and(
              eq(duplicateCandidates.projectId, primary.projectId),
              or(
                eq(duplicateCandidates.primaryObservationId, duplicateObservationId),
                eq(duplicateCandidates.duplicateObservationId, duplicateObservationId),
              ),
            ),
          )
          .all();

        for (const candidate of relatedCandidates) {
          if (candidate.status !== "resolved") {
            await tx
              .update(duplicateCandidates)
              .set({ status: "resolved", updatedAt: new Date() })
              .where(eq(duplicateCandidates.id, candidate.id))
              .run();

            await tx
              .insert(duplicateCandidateEvents)
              .values({
                candidateId: candidate.id,
                fromStatus: candidate.status,
                toStatus: "resolved",
                reason: `Merged #${duplicateObservationId} into #${primaryObservationId}`,
              })
              .run();
          }
        }

        const mergedRow = await tx
          .select()
          .from(observations)
          .where(eq(observations.id, duplicateObservationId))
          .get();
        if (!mergedRow)
          throw new Error(`Observation #${duplicateObservationId} not found after merge`);

        return {
          primary: toObservation(updatedPrimaryRow),
          merged: toObservation(mergedRow),
          relation,
          merge: toMerge(mergeRow),
        };
      });
    },
  };
}
