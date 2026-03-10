/** Configuration for {@link createObsxa}. */
export interface ObsxaOptions {
  /** Path to SQLite database file, or `:memory:` for in-memory. */
  db: string
  /** Run schema migrations on open. @default true */
  autoMigrate?: boolean
  /** Back up database before migration. @default true */
  autoBackup?: boolean
  /** Directory for migration backups. Defaults to same directory as `db`. */
  backupDir?: string
}

export type ObservationType = 'pattern' | 'anomaly' | 'measurement' | 'correlation' | 'artifact'
export type SourceType = 'experiment' | 'manual' | 'scan' | 'computation' | 'external'
export type ObservationStatus = 'active' | 'promoted' | 'dismissed' | 'archived'
export type ObservationRelationType =
  | 'similar_to'
  | 'contradicts'
  | 'supports'
  | 'derived_from'
  | 'duplicate_of'
  | 'refines'
  | 'same_signal_as'

export type DuplicateCandidateStatus = 'open' | 'resolved' | 'dismissed'
export type MergeConfidenceStrategy = 'primary' | 'max' | 'average'
export type ObservationStatusReasonCode =
  | 'noise'
  | 'duplicate'
  | 'merged'
  | 'irrelevant'
  | 'invalid'
  | 'manual_review'
  | 'promoted'

export type TriageSort = 'triage' | 'recent'

export interface Project { id: string; name: string; description: string | null; createdAt: Date }
export interface CreateProject { id: string; name: string; description?: string }

export interface Observation {
  id: number; projectId: string; title: string; description: string | null
  type: ObservationType; source: string; sourceType: SourceType
  confidence: number; frequency: number; status: ObservationStatus
  promotedTo: string | null; tags: string[]; data: string | null
  context: string | null
  capturedAt: Date | null
  sourceRef: string | null
  collector: string | null
  inputHash: string | null
  evidenceStrength: number
  novelty: number
  uncertainty: number
  reproducibilityHint: string | null
  triageScore: number
  dismissedReasonCode: ObservationStatusReasonCode | null
  archivedReasonCode: ObservationStatusReasonCode | null
  createdAt: Date; updatedAt: Date | null
}

export interface AddObservation {
  projectId: string; title: string; description?: string
  type?: ObservationType; source: string; sourceType?: SourceType
  confidence?: number; tags?: string[]; data?: string
  context?: string
  capturedAt?: Date | string
  sourceRef?: string
  collector?: string
  inputHash?: string
  evidenceStrength?: number
  novelty?: number
  uncertainty?: number
  reproducibilityHint?: string
}

export interface UpdateObservation {
  title?: string; description?: string; type?: ObservationType
  source?: string; sourceType?: SourceType;   confidence?: number
  tags?: string[]; data?: string
  context?: string | null
  capturedAt?: Date | string | null
  sourceRef?: string | null
  collector?: string | null
  inputHash?: string | null
  evidenceStrength?: number
  novelty?: number
  uncertainty?: number
  reproducibilityHint?: string | null
}

export interface ObservationTransition {
  id: number
  observationId: number
  fromStatus: ObservationStatus
  toStatus: ObservationStatus
  reasonCode: ObservationStatusReasonCode
  reasonNote: string | null
  createdAt: Date
}

export interface TransitionObservation {
  reasonCode: ObservationStatusReasonCode
  reasonNote?: string
}

export interface ObservationImportRecord extends AddObservation {
  status?: ObservationStatus
  promotedTo?: string | null
}

export interface ObservationBatchUpdateRecord extends UpdateObservation {
  id: number
}

export interface ObservationEdit {
  id: number
  observationId: number
  field: string
  oldValue: string | null
  newValue: string | null
  createdAt: Date
}

export interface ObservationRelation {
  id: number; fromObservationId: number; toObservationId: number
  type: ObservationRelationType; confidence: number; notes: string | null; createdAt: Date
}

export interface AddRelation {
  fromObservationId: number
  toObservationId: number
  type: ObservationRelationType
  confidence?: number
  notes?: string
}

export interface DuplicateCandidate {
  id: number
  projectId: string
  primaryObservationId: number
  duplicateObservationId: number
  reason: string
  score: number
  status: DuplicateCandidateStatus
  createdAt: Date
  updatedAt: Date | null
}

export interface ScanDuplicatesResult {
  candidates: DuplicateCandidate[]
  checkedPairs: number
}

export interface DuplicateCandidateEvent {
  id: number
  candidateId: number
  fromStatus: DuplicateCandidateStatus
  toStatus: DuplicateCandidateStatus
  reason: string
  createdAt: Date
}

export interface CandidateReviewResult {
  candidate: DuplicateCandidate
  event: DuplicateCandidateEvent
}

export interface MergeOptions {
  confidenceStrategy?: MergeConfidenceStrategy
  relationType?: ObservationRelationType
  relationConfidence?: number
  relationNotes?: string
  mergeDescription?: 'primary' | 'duplicate' | 'concat'
}

export interface ObservationMerge {
  id: number
  projectId: string
  primaryObservationId: number
  mergedObservationId: number
  relationId: number | null
  confidenceStrategy: MergeConfidenceStrategy
  summary: string
  createdAt: Date
}

export interface MergeResult {
  primary: Observation
  merged: Observation
  relation: ObservationRelation | null
  merge: ObservationMerge
}

export interface TriageRow {
  observation: Observation
  score: number
  supports: number
  contradicts: number
}

export interface Cluster {
  id: number; projectId: string; name: string; description: string | null; createdAt: Date
}

export interface AddCluster {
  projectId: string; name: string; description?: string
}

export interface ClusterMember {
  id: number; clusterId: number; observationId: number; createdAt: Date
}

export interface ProjectStats {
  total: number; active: number; promoted: number; dismissed: number; archived: number
  avgConfidence: number; totalClusters: number
  byType: { pattern: number; anomaly: number; measurement: number; correlation: number; artifact: number }
}

export interface SearchResult { observation: Observation; rank: number }

export const RELATION_TYPES: ObservationRelationType[] = [
  'similar_to',
  'contradicts',
  'supports',
  'derived_from',
  'duplicate_of',
  'refines',
  'same_signal_as',
]
