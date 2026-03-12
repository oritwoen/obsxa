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
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid date: ${value}`);
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date string: "${value}"`);
  return parsed;
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
    async add(input: AddObservation): Promise<Observation> {
      const project = await db
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

      const row = await db
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

    async addMany(records: ObservationImportRecord[]): Promise<Observation[]> {
      const results: Observation[] = [];
      for (const record of records) {
        if (record.status === "promoted" && !record.promotedTo) {
          throw new Error("Imported promoted observations must include promotedTo");
        }
        const created = await this.add(record);
        if (record.status === "dismissed") {
          results.push(
            await this.dismiss(created.id, {
              reasonCode: "manual_review",
              reasonNote: "Imported as dismissed",
            }),
          );
          continue;
        }
        if (record.status === "archived") {
          results.push(
            await this.archive(created.id, {
              reasonCode: "manual_review",
              reasonNote: "Imported as archived",
            }),
          );
          continue;
        }
        if (record.status === "promoted") {
          results.push(await this.promote(created.id, record.promotedTo!));
          continue;
        }
        results.push(created);
      }
      return results;
    },

    async get(id: number): Promise<Observation | null> {
      const row = await db.select().from(observations).where(eq(observations.id, id)).get();
      return row ? toObservation(row) : null;
    },

    async getByInputHash(projectId: string, inputHash: string): Promise<Observation | null> {
      const row = await db
        .select()
        .from(observations)
        .where(and(eq(observations.projectId, projectId), eq(observations.inputHash, inputHash)))
        .get();
      return row ? toObservation(row) : null;
    },

    async list(
      projectId: string,
      opts?: {
        status?: ObservationStatus;
        type?: ObservationType;
        sourceType?: SourceType;
      },
    ): Promise<Observation[]> {
      const conditions = [eq(observations.projectId, projectId)];
      if (opts?.status) conditions.push(eq(observations.status, opts.status));
      if (opts?.type) conditions.push(eq(observations.type, opts.type));
      if (opts?.sourceType) conditions.push(eq(observations.sourceType, opts.sourceType));
      return (
        await db
          .select()
          .from(observations)
          .where(and(...conditions))
          .all()
      ).map(toObservation);
    },

    async transitions(observationId: number): Promise<ObservationTransition[]> {
      return (
        await db
          .select()
          .from(observationStatusEvents)
          .where(eq(observationStatusEvents.observationId, observationId))
          .orderBy(asc(observationStatusEvents.createdAt), asc(observationStatusEvents.id))
          .all()
      ).map(toTransition);
    },

    async edits(observationId: number): Promise<ObservationEdit[]> {
      return (
        await db
          .select()
          .from(observationEdits)
          .where(eq(observationEdits.observationId, observationId))
          .orderBy(asc(observationEdits.createdAt), asc(observationEdits.id))
          .all()
      ).map((row) => ({
        id: row.id,
        observationId: row.observationId,
        field: row.field,
        oldValue: row.oldValue,
        newValue: row.newValue,
        createdAt: row.createdAt,
      }));
    },

    async update(id: number, fields: UpdateObservation): Promise<Observation> {
      return db.transaction(async (tx) => {
        const current = await tx.select().from(observations).where(eq(observations.id, id)).get();
        if (!current) throw new Error(`Observation #${id} not found`);

        const values: Record<string, unknown> = { updatedAt: new Date() };
        const editRecords: { field: string; oldValue: string | null; newValue: string | null }[] =
          [];

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

        const row = await tx
          .update(observations)
          .set(values)
          .where(eq(observations.id, id))
          .returning()
          .get();

        for (const edit of editRecords) {
          await tx
            .insert(observationEdits)
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

    async updateMany(records: ObservationBatchUpdateRecord[]): Promise<Observation[]> {
      const updated: Observation[] = [];
      for (const record of records) {
        const { id, ...fields } = record;
        updated.push(await this.update(id, fields));
      }
      return updated;
    },

    async dismiss(id: number, transition: TransitionObservation): Promise<Observation> {
      return db.transaction(async (tx) => {
        const existing = await tx.select().from(observations).where(eq(observations.id, id)).get();
        if (!existing) throw new Error(`Observation #${id} not found`);
        if (existing.status !== "active") {
          throw new Error(
            `Observation #${id} must be active to dismiss (current: ${existing.status})`,
          );
        }

        const row = await tx
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

        await tx
          .insert(observationStatusEvents)
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

    async archive(id: number, transition: TransitionObservation): Promise<Observation> {
      return db.transaction(async (tx) => {
        const existing = await tx.select().from(observations).where(eq(observations.id, id)).get();
        if (!existing) throw new Error(`Observation #${id} not found`);
        if (existing.status !== "active") {
          throw new Error(
            `Observation #${id} must be active to archive (current: ${existing.status})`,
          );
        }

        const row = await tx
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

        await tx
          .insert(observationStatusEvents)
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

    async incrementFrequency(id: number): Promise<Observation> {
      return db.transaction(async (tx) => {
        const existing = await tx.select().from(observations).where(eq(observations.id, id)).get();
        if (!existing) throw new Error(`Observation #${id} not found`);

        const frequency = existing.frequency + 1;
        const triageScore = computeTriageScore({
          confidence: existing.confidence,
          evidenceStrength: existing.evidenceStrength,
          novelty: existing.novelty,
          uncertainty: existing.uncertainty,
          frequency,
        });

        const row = await tx
          .update(observations)
          .set({ frequency, triageScore, updatedAt: new Date() })
          .where(eq(observations.id, id))
          .returning()
          .get();
        return toObservation(row);
      });
    },

    async promote(id: number, hypothesisRef: string): Promise<Observation> {
      return db.transaction(async (tx) => {
        const existing = await tx.select().from(observations).where(eq(observations.id, id)).get();
        if (!existing) throw new Error(`Observation #${id} not found`);
        if (existing.status !== "active") {
          throw new Error(
            `Observation #${id} must be active to promote (current: ${existing.status})`,
          );
        }

        const row = await tx
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

        await tx
          .insert(observationStatusEvents)
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
