import { and, asc, eq } from "drizzle-orm";
import { observations, observationEdits, observationStatusEvents, projects } from "./db.ts";
import type { ObsxaDB } from "./db.ts";
import { clampPercent, computeTriageScore, toObservation } from "./mappers.ts";
import type {
  AddObservation,
  Observation,
  ObservationBatchUpdateRecord,
  ObservationEdit,
  ObservationImportRecord,
  ObservationStatus,
  ObservationStatusReasonCode,
  ObservationType,
  ObservationTransition,
  SourceType,
  TransitionObservation,
  UpdateObservation,
} from "../types.ts";

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toTransition(row: typeof observationStatusEvents.$inferSelect): ObservationTransition {
  return {
    id: row.id,
    observationId: row.observationId,
    fromStatus: row.fromStatus as ObservationStatus,
    toStatus: row.toStatus as ObservationStatus,
    reasonCode: row.reasonCode as ObservationStatusReasonCode,
    reasonNote: row.reasonNote,
    createdAt: row.createdAt,
  };
}

export function createObservationStore(db: ObsxaDB) {
  return {
    add(input: AddObservation): Observation {
      const project = db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get();
      if (!project) throw new Error(`Project "${input.projectId}" not found`);

      const confidence = clampPercent(input.confidence ?? 50, 50);
      const evidenceStrength = clampPercent(input.evidenceStrength ?? 50, 50);
      const novelty = clampPercent(input.novelty ?? 50, 50);
      const uncertainty = clampPercent(input.uncertainty ?? 50, 50);
      const triageScore = computeTriageScore({
        confidence,
        evidenceStrength,
        novelty,
        uncertainty,
        frequency: 1,
      });

      const row = db
        .insert(observations)
        .values({
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          type: input.type ?? "pattern",
          source: input.source,
          sourceType: input.sourceType ?? "manual",
          confidence,
          tags: JSON.stringify(input.tags ?? []),
          data: input.data,
          context: input.context,
          capturedAt: parseDate(input.capturedAt),
          sourceRef: input.sourceRef,
          collector: input.collector,
          inputHash: input.inputHash,
          evidenceStrength,
          novelty,
          uncertainty,
          reproducibilityHint: input.reproducibilityHint,
          triageScore,
        })
        .returning()
        .get();

      return toObservation(row);
    },

    addMany(records: ObservationImportRecord[]): Observation[] {
      return records.map((record) => {
        const created = this.add(record);
        if (record.status === "dismissed") {
          return this.dismiss(created.id, {
            reasonCode: "manual_review",
            reasonNote: "Imported as dismissed",
          });
        }
        if (record.status === "archived") {
          return this.archive(created.id, {
            reasonCode: "manual_review",
            reasonNote: "Imported as archived",
          });
        }
        if (record.status === "promoted") {
          if (!record.promotedTo) {
            throw new Error("Imported promoted observations must include promotedTo");
          }
          return this.promote(created.id, record.promotedTo);
        }
        return created;
      });
    },

    get(id: number): Observation | null {
      const row = db.select().from(observations).where(eq(observations.id, id)).get();
      return row ? toObservation(row) : null;
    },

    list(
      projectId: string,
      opts?: {
        status?: ObservationStatus;
        type?: ObservationType;
        sourceType?: SourceType;
      },
    ): Observation[] {
      const conditions = [eq(observations.projectId, projectId)];
      if (opts?.status) conditions.push(eq(observations.status, opts.status));
      if (opts?.type) conditions.push(eq(observations.type, opts.type));
      if (opts?.sourceType) conditions.push(eq(observations.sourceType, opts.sourceType));
      return db
        .select()
        .from(observations)
        .where(and(...conditions))
        .all()
        .map(toObservation);
    },

    transitions(observationId: number): ObservationTransition[] {
      return db
        .select()
        .from(observationStatusEvents)
        .where(eq(observationStatusEvents.observationId, observationId))
        .orderBy(asc(observationStatusEvents.createdAt), asc(observationStatusEvents.id))
        .all()
        .map(toTransition);
    },

    edits(observationId: number): ObservationEdit[] {
      return db
        .select()
        .from(observationEdits)
        .where(eq(observationEdits.observationId, observationId))
        .orderBy(asc(observationEdits.createdAt), asc(observationEdits.id))
        .all()
        .map((row) => ({
          id: row.id,
          observationId: row.observationId,
          field: row.field,
          oldValue: row.oldValue,
          newValue: row.newValue,
          createdAt: row.createdAt,
        }));
    },

    update(id: number, fields: UpdateObservation): Observation {
      const current = db.select().from(observations).where(eq(observations.id, id)).get();
      if (!current) throw new Error(`Observation #${id} not found`);

      const values: Record<string, unknown> = { updatedAt: new Date() };
      const editRecords: { field: string; oldValue: string | null; newValue: string | null }[] = [];

      function track(field: string, oldVal: unknown, newVal: unknown) {
        const o = oldVal == null ? null : String(oldVal);
        const n = newVal == null ? null : String(newVal);
        if (o !== n) editRecords.push({ field, oldValue: o, newValue: n });
      }

      if (fields.title !== undefined) {
        track("title", current.title, fields.title);
        values.title = fields.title;
      }
      if (fields.description !== undefined) {
        track("description", current.description, fields.description);
        values.description = fields.description;
      }
      if (fields.type !== undefined) {
        track("type", current.type, fields.type);
        values.type = fields.type;
      }
      if (fields.source !== undefined) {
        track("source", current.source, fields.source);
        values.source = fields.source;
      }
      if (fields.sourceType !== undefined) {
        track("sourceType", current.sourceType, fields.sourceType);
        values.sourceType = fields.sourceType;
      }
      if (fields.confidence !== undefined) {
        const v = clampPercent(fields.confidence, current.confidence);
        track("confidence", current.confidence, v);
        values.confidence = v;
      }
      if (fields.tags !== undefined) {
        const v = JSON.stringify(fields.tags);
        track("tags", current.tags, v);
        values.tags = v;
      }
      if (fields.data !== undefined) {
        track("data", current.data, fields.data);
        values.data = fields.data;
      }
      if (fields.context !== undefined) {
        track("context", current.context, fields.context);
        values.context = fields.context;
      }
      if (fields.capturedAt !== undefined) {
        const v = parseDate(fields.capturedAt);
        track("capturedAt", current.capturedAt?.getTime() ?? null, v?.getTime() ?? null);
        values.capturedAt = v;
      }
      if (fields.sourceRef !== undefined) {
        track("sourceRef", current.sourceRef, fields.sourceRef);
        values.sourceRef = fields.sourceRef;
      }
      if (fields.collector !== undefined) {
        track("collector", current.collector, fields.collector);
        values.collector = fields.collector;
      }
      if (fields.inputHash !== undefined) {
        track("inputHash", current.inputHash, fields.inputHash);
        values.inputHash = fields.inputHash;
      }
      if (fields.evidenceStrength !== undefined) {
        const v = clampPercent(fields.evidenceStrength, current.evidenceStrength);
        track("evidenceStrength", current.evidenceStrength, v);
        values.evidenceStrength = v;
      }
      if (fields.novelty !== undefined) {
        const v = clampPercent(fields.novelty, current.novelty);
        track("novelty", current.novelty, v);
        values.novelty = v;
      }
      if (fields.uncertainty !== undefined) {
        const v = clampPercent(fields.uncertainty, current.uncertainty);
        track("uncertainty", current.uncertainty, v);
        values.uncertainty = v;
      }
      if (fields.reproducibilityHint !== undefined) {
        track("reproducibilityHint", current.reproducibilityHint, fields.reproducibilityHint);
        values.reproducibilityHint = fields.reproducibilityHint;
      }

      const nextConfidence = (values.confidence as number | undefined) ?? current.confidence;
      const nextEvidence =
        (values.evidenceStrength as number | undefined) ?? current.evidenceStrength;
      const nextNovelty = (values.novelty as number | undefined) ?? current.novelty;
      const nextUncertainty = (values.uncertainty as number | undefined) ?? current.uncertainty;
      values.triageScore = computeTriageScore({
        confidence: nextConfidence,
        evidenceStrength: nextEvidence,
        novelty: nextNovelty,
        uncertainty: nextUncertainty,
        frequency: current.frequency,
      });

      return db.transaction((tx) => {
        const row = tx
          .update(observations)
          .set(values)
          .where(eq(observations.id, id))
          .returning()
          .get();

        for (const edit of editRecords) {
          tx.insert(observationEdits)
            .values({
              observationId: id,
              field: edit.field,
              oldValue: edit.oldValue,
              newValue: edit.newValue,
            })
            .run();
        }

        return toObservation(row);
      });
    },

    updateMany(records: ObservationBatchUpdateRecord[]): Observation[] {
      return records.map((record) => {
        const { id, ...fields } = record;
        return this.update(id, fields);
      });
    },

    dismiss(id: number, transition: TransitionObservation): Observation {
      const existing = db.select().from(observations).where(eq(observations.id, id)).get();
      if (!existing) throw new Error(`Observation #${id} not found`);
      if (existing.status !== "active") {
        throw new Error(
          `Observation #${id} must be active to dismiss (current: ${existing.status})`,
        );
      }

      return db.transaction((tx) => {
        const row = tx
          .update(observations)
          .set({
            status: "dismissed",
            dismissedReasonCode: transition.reasonCode,
            archivedReasonCode: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, id))
          .returning()
          .get();

        tx.insert(observationStatusEvents)
          .values({
            observationId: id,
            fromStatus: existing.status,
            toStatus: "dismissed",
            reasonCode: transition.reasonCode,
            reasonNote: transition.reasonNote,
          })
          .run();

        return toObservation(row);
      });
    },

    archive(id: number, transition: TransitionObservation): Observation {
      const existing = db.select().from(observations).where(eq(observations.id, id)).get();
      if (!existing) throw new Error(`Observation #${id} not found`);
      if (existing.status !== "active") {
        throw new Error(
          `Observation #${id} must be active to archive (current: ${existing.status})`,
        );
      }

      return db.transaction((tx) => {
        const row = tx
          .update(observations)
          .set({
            status: "archived",
            archivedReasonCode: transition.reasonCode,
            dismissedReasonCode: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, id))
          .returning()
          .get();

        tx.insert(observationStatusEvents)
          .values({
            observationId: id,
            fromStatus: existing.status,
            toStatus: "archived",
            reasonCode: transition.reasonCode,
            reasonNote: transition.reasonNote,
          })
          .run();

        return toObservation(row);
      });
    },

    incrementFrequency(id: number): Observation {
      const existing = db.select().from(observations).where(eq(observations.id, id)).get();
      if (!existing) throw new Error(`Observation #${id} not found`);

      const frequency = existing.frequency + 1;
      const triageScore = computeTriageScore({
        confidence: existing.confidence,
        evidenceStrength: existing.evidenceStrength,
        novelty: existing.novelty,
        uncertainty: existing.uncertainty,
        frequency,
      });

      const row = db
        .update(observations)
        .set({ frequency, triageScore, updatedAt: new Date() })
        .where(eq(observations.id, id))
        .returning()
        .get();
      return toObservation(row);
    },

    promote(id: number, hypothesisRef: string): Observation {
      const existing = db.select().from(observations).where(eq(observations.id, id)).get();
      if (!existing) throw new Error(`Observation #${id} not found`);
      if (existing.status !== "active") {
        throw new Error(
          `Observation #${id} must be active to promote (current: ${existing.status})`,
        );
      }

      return db.transaction((tx) => {
        const row = tx
          .update(observations)
          .set({
            status: "promoted",
            promotedTo: hypothesisRef,
            dismissedReasonCode: null,
            archivedReasonCode: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, id))
          .returning()
          .get();

        tx.insert(observationStatusEvents)
          .values({
            observationId: id,
            fromStatus: existing.status,
            toStatus: "promoted",
            reasonCode: "promoted",
            reasonNote: hypothesisRef,
          })
          .run();

        return toObservation(row);
      });
    },
  };
}
