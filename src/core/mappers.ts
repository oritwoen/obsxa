import { observationRelations, observations } from './db.ts'
import type {
  Observation,
  ObservationRelation,
  ObservationRelationType,
  ObservationStatus,
  ObservationStatusReasonCode,
  ObservationType,
  SourceType,
} from '../types.ts'

export function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

export function computeTriageScore(params: {
  confidence: number
  evidenceStrength: number
  novelty: number
  uncertainty: number
  frequency: number
}): number {
  const base = (params.confidence * 0.3) + (params.evidenceStrength * 0.35) + (params.novelty * 0.25) - (params.uncertainty * 0.2)
  const frequencyBoost = Math.min(15, Math.max(0, params.frequency - 1) * 3)
  return clampPercent(base + frequencyBoost + 20, 50)
}

export function toObservation(row: typeof observations.$inferSelect): Observation {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    type: row.type as ObservationType,
    source: row.source,
    sourceType: row.sourceType as SourceType,
    confidence: row.confidence,
    frequency: row.frequency,
    status: row.status as ObservationStatus,
    promotedTo: row.promotedTo,
    tags: parseTags(row.tags),
    data: row.data,
    context: row.context,
    capturedAt: row.capturedAt,
    sourceRef: row.sourceRef,
    collector: row.collector,
    inputHash: row.inputHash,
    evidenceStrength: row.evidenceStrength,
    novelty: row.novelty,
    uncertainty: row.uncertainty,
    reproducibilityHint: row.reproducibilityHint,
    triageScore: row.triageScore,
    dismissedReasonCode: row.dismissedReasonCode as ObservationStatusReasonCode | null,
    archivedReasonCode: row.archivedReasonCode as ObservationStatusReasonCode | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function toRelation(row: typeof observationRelations.$inferSelect): ObservationRelation {
  return {
    id: row.id,
    fromObservationId: row.fromObservationId,
    toObservationId: row.toObservationId,
    type: row.type as ObservationRelationType,
    confidence: row.confidence,
    notes: row.notes,
    createdAt: row.createdAt,
  }
}
