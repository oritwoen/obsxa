import { tool } from 'ai'
import { z } from 'zod/v4'
import { createObsxa } from './index.ts'
import type { ObsxaInstance } from './index.ts'

function getOrCreate(dbPath?: string): ObsxaInstance {
  return createObsxa({ db: dbPath ?? './obsxa.db' })
}

export const observationTool = tool({
  description: 'Manage observations: add/get/list/update, transitions, dismiss/archive, bump, import and batch update.',
  inputSchema: z.discriminatedUnion('operation', [
    z.object({
      operation: z.literal('add'),
      db: z.string().optional(),
      projectId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      type: z.enum(['pattern', 'anomaly', 'measurement', 'correlation', 'artifact']).optional(),
      source: z.string(),
      sourceType: z.enum(['experiment', 'manual', 'scan', 'computation', 'external']).optional(),
      confidence: z.number().optional(),
      tags: z.array(z.string()).optional(),
      data: z.string().optional(),
      context: z.string().optional(),
      capturedAt: z.string().optional(),
      sourceRef: z.string().optional(),
      collector: z.string().optional(),
      inputHash: z.string().optional(),
      evidenceStrength: z.number().optional(),
      novelty: z.number().optional(),
      uncertainty: z.number().optional(),
      reproducibilityHint: z.string().optional(),
    }),
    z.object({ operation: z.literal('get'), db: z.string().optional(), id: z.number() }),
    z.object({
      operation: z.literal('list'),
      db: z.string().optional(),
      projectId: z.string(),
      status: z.enum(['active', 'promoted', 'dismissed', 'archived']).optional(),
      type: z.enum(['pattern', 'anomaly', 'measurement', 'correlation', 'artifact']).optional(),
      sourceType: z.enum(['experiment', 'manual', 'scan', 'computation', 'external']).optional(),
    }),
    z.object({
      operation: z.literal('update'),
      db: z.string().optional(),
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(['pattern', 'anomaly', 'measurement', 'correlation', 'artifact']).optional(),
      source: z.string().optional(),
      sourceType: z.enum(['experiment', 'manual', 'scan', 'computation', 'external']).optional(),
      confidence: z.number().optional(),
      tags: z.array(z.string()).optional(),
      data: z.string().optional(),
      context: z.string().nullable().optional(),
      capturedAt: z.string().nullable().optional(),
      sourceRef: z.string().nullable().optional(),
      collector: z.string().nullable().optional(),
      inputHash: z.string().nullable().optional(),
      evidenceStrength: z.number().optional(),
      novelty: z.number().optional(),
      uncertainty: z.number().optional(),
      reproducibilityHint: z.string().nullable().optional(),
    }),
    z.object({ operation: z.literal('transitions'), db: z.string().optional(), id: z.number() }),
    z.object({ operation: z.literal('edits'), db: z.string().optional(), id: z.number() }),
    z.object({ operation: z.literal('dismiss'), db: z.string().optional(), id: z.number(), reasonCode: z.enum(['noise', 'duplicate', 'merged', 'irrelevant', 'invalid', 'manual_review']), reasonNote: z.string().optional() }),
    z.object({ operation: z.literal('archive'), db: z.string().optional(), id: z.number(), reasonCode: z.enum(['noise', 'duplicate', 'merged', 'irrelevant', 'invalid', 'manual_review']), reasonNote: z.string().optional() }),
    z.object({ operation: z.literal('bump'), db: z.string().optional(), id: z.number() }),
    z.object({ operation: z.literal('import'), db: z.string().optional(), records: z.array(z.object({
      projectId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      type: z.enum(['pattern', 'anomaly', 'measurement', 'correlation', 'artifact']).optional(),
      source: z.string(),
      sourceType: z.enum(['experiment', 'manual', 'scan', 'computation', 'external']).optional(),
      confidence: z.number().optional(),
      tags: z.array(z.string()).optional(),
      data: z.string().optional(),
      context: z.string().optional(),
      capturedAt: z.string().optional(),
      sourceRef: z.string().optional(),
      collector: z.string().optional(),
      inputHash: z.string().optional(),
      evidenceStrength: z.number().optional(),
      novelty: z.number().optional(),
      uncertainty: z.number().optional(),
      reproducibilityHint: z.string().optional(),
      status: z.enum(['active', 'promoted', 'dismissed', 'archived']).optional(),
      promotedTo: z.string().nullable().optional(),
    })) }),
    z.object({ operation: z.literal('batchUpdate'), db: z.string().optional(), records: z.array(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(['pattern', 'anomaly', 'measurement', 'correlation', 'artifact']).optional(),
      source: z.string().optional(),
      sourceType: z.enum(['experiment', 'manual', 'scan', 'computation', 'external']).optional(),
      confidence: z.number().optional(),
      tags: z.array(z.string()).optional(),
      data: z.string().optional(),
      context: z.string().nullable().optional(),
      capturedAt: z.string().nullable().optional(),
      sourceRef: z.string().nullable().optional(),
      collector: z.string().nullable().optional(),
      inputHash: z.string().nullable().optional(),
      evidenceStrength: z.number().optional(),
      novelty: z.number().optional(),
      uncertainty: z.number().optional(),
      reproducibilityHint: z.string().nullable().optional(),
    })) }),
  ]),
  execute: async (input) => {
    const obsxa = getOrCreate(input.db)
    try {
      switch (input.operation) {
        case 'add':
          return obsxa.observation.add(input)
        case 'get':
          return obsxa.observation.get(input.id)
        case 'list':
          return obsxa.observation.list(input.projectId, {
            status: input.status,
            type: input.type,
            sourceType: input.sourceType,
          })
        case 'update':
          return obsxa.observation.update(input.id, {
            title: input.title,
            description: input.description,
            type: input.type,
            source: input.source,
            sourceType: input.sourceType,
            confidence: input.confidence,
            tags: input.tags,
            data: input.data,
            context: input.context,
            capturedAt: input.capturedAt,
            sourceRef: input.sourceRef,
            collector: input.collector,
            inputHash: input.inputHash,
            evidenceStrength: input.evidenceStrength,
            novelty: input.novelty,
            uncertainty: input.uncertainty,
            reproducibilityHint: input.reproducibilityHint,
          })
        case 'transitions':
          return obsxa.observation.transitions(input.id)
        case 'edits':
          return obsxa.observation.edits(input.id)
        case 'dismiss':
          return obsxa.observation.dismiss(input.id, { reasonCode: input.reasonCode, reasonNote: input.reasonNote })
        case 'archive':
          return obsxa.observation.archive(input.id, { reasonCode: input.reasonCode, reasonNote: input.reasonNote })
        case 'bump':
          return obsxa.observation.incrementFrequency(input.id)
        case 'import':
          return obsxa.observation.addMany(input.records)
        case 'batchUpdate':
          return obsxa.observation.updateMany(input.records)
      }
    } finally {
      obsxa.close()
    }
  },
})

export const relationTool = tool({
  description: 'Manage observation relations: add and list.',
  inputSchema: z.discriminatedUnion('operation', [
    z.object({
      operation: z.literal('add'),
      db: z.string().optional(),
      fromObservationId: z.number(),
      toObservationId: z.number(),
      type: z.enum(['similar_to', 'contradicts', 'supports', 'derived_from', 'duplicate_of', 'refines', 'same_signal_as']),
      confidence: z.number().optional(),
      notes: z.string().optional(),
    }),
    z.object({ operation: z.literal('list'), db: z.string().optional(), observationId: z.number() }),
  ]),
  execute: async (input) => {
    const obsxa = getOrCreate(input.db)
    try {
      switch (input.operation) {
        case 'add':
          return obsxa.relation.add(input)
        case 'list':
          return obsxa.relation.list(input.observationId)
      }
    } finally {
      obsxa.close()
    }
  },
})

export const clusterTool = tool({
  description: 'Manage observation clusters: add, list, add member, list members.',
  inputSchema: z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('add'), db: z.string().optional(), projectId: z.string(), name: z.string(), description: z.string().optional() }),
    z.object({ operation: z.literal('list'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('addMember'), db: z.string().optional(), clusterId: z.number(), observationId: z.number() }),
    z.object({ operation: z.literal('listMembers'), db: z.string().optional(), clusterId: z.number() }),
  ]),
  execute: async (input) => {
    const obsxa = getOrCreate(input.db)
    try {
      switch (input.operation) {
        case 'add':
          return obsxa.cluster.add({
            projectId: input.projectId,
            name: input.name,
            description: input.description,
          })
        case 'list':
          return obsxa.cluster.list(input.projectId)
        case 'addMember':
          return obsxa.cluster.addMember(input.clusterId, input.observationId)
        case 'listMembers':
          return obsxa.cluster.listMembers(input.clusterId)
      }
    } finally {
      obsxa.close()
    }
  },
})

export const searchTool = tool({
  description: 'Search observations via FTS or LIKE fallback.',
  inputSchema: z.object({
    db: z.string().optional(),
    query: z.string(),
    projectId: z.string().optional(),
    limit: z.number().optional(),
  }),
  execute: async ({ db, query, projectId, limit }) => {
    const obsxa = getOrCreate(db)
    try {
      return obsxa.search.search(query, projectId, limit)
    } finally {
      obsxa.close()
    }
  },
})

export const analysisTool = tool({
  description: 'Run observation analyses: stats, frequent, isolated, convergent, promoted, unpromoted, triage.',
  inputSchema: z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('stats'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('frequent'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('isolated'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('convergent'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('promoted'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('unpromoted'), db: z.string().optional(), projectId: z.string() }),
    z.object({ operation: z.literal('triage'), db: z.string().optional(), projectId: z.string(), limit: z.number().optional(), sort: z.enum(['triage', 'recent']).optional() }),
  ]),
  execute: async (input) => {
    const obsxa = getOrCreate(input.db)
    try {
      switch (input.operation) {
        case 'stats':
          return obsxa.analysis.stats(input.projectId)
        case 'frequent':
          return obsxa.analysis.frequent(input.projectId)
        case 'isolated':
          return obsxa.analysis.isolated(input.projectId)
        case 'convergent':
          return obsxa.analysis.convergent(input.projectId)
        case 'promoted':
          return obsxa.analysis.promoted(input.projectId)
        case 'unpromoted':
          return obsxa.analysis.unpromoted(input.projectId)
        case 'triage':
          return obsxa.analysis.triage(input.projectId, input.limit, input.sort)
      }
    } finally {
      obsxa.close()
    }
  },
})

export const promoteTool = tool({
  description: 'Promote active observation to hypothesis candidate.',
  inputSchema: z.object({ db: z.string().optional(), observationId: z.number(), hypothesisRef: z.string() }),
  execute: async ({ db, observationId, hypothesisRef }) => {
    const obsxa = getOrCreate(db)
    try {
      return obsxa.observation.promote(observationId, hypothesisRef)
    } finally {
      obsxa.close()
    }
  },
})

export const dedupTool = tool({
  description: 'Dedup workflow: scan/list/review candidates and merge duplicates.',
  inputSchema: z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('scan'), db: z.string().optional(), projectId: z.string(), threshold: z.number().min(0).max(1).optional() }),
    z.object({ operation: z.literal('candidates'), db: z.string().optional(), projectId: z.string(), status: z.enum(['open', 'resolved', 'dismissed', 'all']).optional() }),
    z.object({ operation: z.literal('review'), db: z.string().optional(), candidateId: z.number(), status: z.enum(['open', 'resolved', 'dismissed']), reason: z.string() }),
    z.object({
      operation: z.literal('merge'),
      db: z.string().optional(),
      primaryObservationId: z.number(),
      duplicateObservationId: z.number(),
      confidenceStrategy: z.enum(['primary', 'max', 'average']).optional(),
      relationType: z.enum(['similar_to', 'contradicts', 'supports', 'derived_from', 'duplicate_of', 'refines', 'same_signal_as']).optional(),
      relationConfidence: z.number().optional(),
      relationNotes: z.string().optional(),
      mergeDescription: z.enum(['primary', 'duplicate', 'concat']).optional(),
    }),
  ]),
  execute: async (input) => {
    const obsxa = getOrCreate(input.db)
    try {
      switch (input.operation) {
        case 'scan':
          return obsxa.dedup.scan(input.projectId, input.threshold)
        case 'candidates':
          return obsxa.dedup.candidates(input.projectId, input.status)
        case 'review':
          return obsxa.dedup.review(input.candidateId, input.status, input.reason)
        case 'merge':
          return obsxa.dedup.merge(input.primaryObservationId, input.duplicateObservationId, {
            confidenceStrategy: input.confidenceStrategy,
            relationType: input.relationType,
            relationConfidence: input.relationConfidence,
            relationNotes: input.relationNotes,
            mergeDescription: input.mergeDescription,
          })
      }
    } finally {
      obsxa.close()
    }
  },
})
