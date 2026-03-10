import { and, eq, or } from 'drizzle-orm'
import { observationRelations, observations } from './db.ts'
import type { ObsxaDB } from './db.ts'
import { toRelation } from './mappers.ts'
import type { AddRelation, ObservationRelation } from '../types.ts'

export function createRelationStore(db: ObsxaDB) {
  return {
    add(input: AddRelation): ObservationRelation {
      if (input.fromObservationId === input.toObservationId) {
        throw new Error('Cannot create self-reference relation')
      }

      const fromObservation = db.select({ id: observations.id }).from(observations)
        .where(eq(observations.id, input.fromObservationId))
        .get()
      if (!fromObservation) throw new Error(`Observation #${input.fromObservationId} not found`)

      const toObservation = db.select({ id: observations.id }).from(observations)
        .where(eq(observations.id, input.toObservationId))
        .get()
      if (!toObservation) throw new Error(`Observation #${input.toObservationId} not found`)

      const confidence = input.confidence ?? 100
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
        throw new Error('Relation confidence must be between 0 and 100')
      }

      const existing = db.select().from(observationRelations)
        .where(and(
          eq(observationRelations.fromObservationId, input.fromObservationId),
          eq(observationRelations.toObservationId, input.toObservationId),
          eq(observationRelations.type, input.type),
        ))
        .get()
      if (existing) return toRelation(existing)

      const row = db.insert(observationRelations).values({
        fromObservationId: input.fromObservationId,
        toObservationId: input.toObservationId,
        type: input.type,
        confidence,
        notes: input.notes,
      }).returning().get()

      return toRelation(row)
    },

    list(observationId: number): ObservationRelation[] {
      return db.select().from(observationRelations)
        .where(or(
          eq(observationRelations.fromObservationId, observationId),
          eq(observationRelations.toObservationId, observationId),
        ))
        .all()
        .map(toRelation)
    },

    remove(id: number): void {
      db.delete(observationRelations).where(eq(observationRelations.id, id)).run()
    },
  }
}
