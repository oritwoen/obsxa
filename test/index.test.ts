import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { backupDatabase, restoreDatabase } from '../src/backup.ts'
import { createObsxa, type ObsxaInstance } from '../src/index.ts'

describe('obsxa', () => {
  let dbDir: string
  let dbPath: string
  let obsxa: ObsxaInstance
  let obsxaClosed: boolean

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'obsxa-'))
    dbPath = join(dbDir, 'test.db')
    obsxa = createObsxa({ db: dbPath })
    obsxaClosed = false
  })

  afterEach(() => {
    if (!obsxaClosed) {
      obsxa.close()
      obsxaClosed = true
    }
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('creates project', () => {
    const project = obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    expect(project.id).toBe('p1')
    expect(obsxa.project.get('p1')?.name).toBe('Obs Project')
  })

  it('adds observation', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const observation = obsxa.observation.add({
      projectId: 'p1',
      title: 'Noticed repeated modulo residue',
      source: 'E001',
      tags: ['mod', 'residue'],
    })
    expect(observation.id).toBeGreaterThan(0)
    expect(observation.tags).toContain('mod')
  })

  it('lists observations with filters', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const o1 = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1', type: 'pattern' })
    obsxa.observation.add({ projectId: 'p1', title: 'B', source: 'E2', type: 'anomaly' })
    obsxa.observation.dismiss(o1.id, { reasonCode: 'noise' })
    expect(obsxa.observation.list('p1')).toHaveLength(2)
    expect(obsxa.observation.list('p1', { status: 'dismissed' })).toHaveLength(1)
    expect(obsxa.observation.list('p1', { type: 'anomaly' })).toHaveLength(1)
  })

  it('updates observation', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const updated = obsxa.observation.update(obs.id, {
      title: 'A+',
      confidence: 88,
      tags: ['updated'],
    })
    expect(updated.title).toBe('A+')
    expect(updated.confidence).toBe(88)
    expect(updated.updatedAt).not.toBeNull()
  })

  it('dismisses active observation', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const dismissed = obsxa.observation.dismiss(obs.id, { reasonCode: 'noise', reasonNote: 'No signal' })
    expect(dismissed.status).toBe('dismissed')
    const transitions = obsxa.observation.transitions(obs.id)
    expect(transitions).toHaveLength(1)
    expect(transitions[0]?.reasonCode).toBe('noise')
  })

  it('archives active observation with reason', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const archived = obsxa.observation.archive(obs.id, { reasonCode: 'manual_review' })
    expect(archived.status).toBe('archived')
    expect(archived.archivedReasonCode).toBe('manual_review')
  })

  it('increments observation frequency', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const bumped = obsxa.observation.incrementFrequency(obs.id)
    expect(bumped.frequency).toBe(2)
    expect(bumped.updatedAt).not.toBeNull()
  })

  it('promotes observation', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const promoted = obsxa.observation.promote(obs.id, 'hypxa:p1:3')
    expect(promoted.status).toBe('promoted')
    expect(promoted.promotedTo).toBe('hypxa:p1:3')
  })

  it('adds relations and rejects self/duplicate', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const a = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const b = obsxa.observation.add({ projectId: 'p1', title: 'B', source: 'E2' })
    const relation = obsxa.relation.add({ fromObservationId: a.id, toObservationId: b.id, type: 'supports' })
    expect(relation.id).toBeGreaterThan(0)
    expect(relation.confidence).toBe(100)
    expect(() => obsxa.relation.add({ fromObservationId: a.id, toObservationId: a.id, type: 'supports' })).toThrow()
    const dup = obsxa.relation.add({ fromObservationId: a.id, toObservationId: b.id, type: 'supports' })
    expect(dup.id).toBe(relation.id)
  })

  it('stores relation confidence and notes', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const a = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const b = obsxa.observation.add({ projectId: 'p1', title: 'B', source: 'E2' })

    const relation = obsxa.relation.add({
      fromObservationId: a.id,
      toObservationId: b.id,
      type: 'same_signal_as',
      confidence: 83,
      notes: 'Same source family',
    })

    expect(relation.confidence).toBe(83)
    expect(relation.notes).toBe('Same source family')
  })

  it('handles clusters and membership', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const o1 = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1' })
    const o2 = obsxa.observation.add({ projectId: 'p1', title: 'B', source: 'E2' })
    const cluster = obsxa.cluster.add({ projectId: 'p1', name: 'Signals' })
    const m1 = obsxa.cluster.addMember(cluster.id, o1.id)
    const m2 = obsxa.cluster.addMember(cluster.id, o1.id)
    obsxa.cluster.addMember(cluster.id, o2.id)
    expect(m2.id).toBe(m1.id)
    expect(obsxa.cluster.list('p1')).toHaveLength(1)
    expect(obsxa.cluster.listMembers(cluster.id)).toHaveLength(2)
  })

  it('searches observations via fts and fallback', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    obsxa.observation.add({
      projectId: 'p1',
      title: 'Quantum anomaly',
      description: "Euler's signal",
      source: 'scan:1',
      tags: ['quantum'],
    })
    const fts = obsxa.search.search('Quantum', 'p1')
    expect(fts).toHaveLength(1)
    const fallback = obsxa.search.search("'", 'p1')
    expect(fallback.length).toBeGreaterThan(0)
  })

  it('computes analysis stats, frequent, isolated, unpromoted', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const a = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1', type: 'pattern' })
    const b = obsxa.observation.add({ projectId: 'p1', title: 'B', source: 'E2', type: 'anomaly' })
    const c = obsxa.observation.add({ projectId: 'p1', title: 'C', source: 'E3', type: 'measurement' })
    obsxa.observation.incrementFrequency(a.id)
    obsxa.observation.promote(b.id, 'hypxa:p1:4')
    obsxa.relation.add({ fromObservationId: a.id, toObservationId: b.id, type: 'supports' })

    const stats = obsxa.analysis.stats('p1')
    expect(stats.total).toBe(3)
    expect(stats.active).toBe(2)
    expect(stats.promoted).toBe(1)
    expect(stats.byType.measurement).toBe(1)

    const frequent = obsxa.analysis.frequent('p1')
    expect(frequent).toHaveLength(1)
    expect(frequent[0]?.id).toBe(a.id)

    const isolated = obsxa.analysis.isolated('p1')
    expect(isolated.map(o => o.id)).toContain(c.id)

    const unpromoted = obsxa.analysis.unpromoted('p1')
    expect(unpromoted.map(o => o.id)).toContain(a.id)
    expect(unpromoted.map(o => o.id)).toContain(c.id)
    expect(unpromoted.map(o => o.id)).not.toContain(b.id)
  })

  it('computes convergent and promoted analysis', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const target = obsxa.observation.add({ projectId: 'p1', title: 'Target', source: 'E0' })
    const s1 = obsxa.observation.add({ projectId: 'p1', title: 'Support 1', source: 'E1' })
    const s2 = obsxa.observation.add({ projectId: 'p1', title: 'Support 2', source: 'E2' })
    const promoted = obsxa.observation.add({ projectId: 'p1', title: 'Promoted', source: 'E3' })
    obsxa.relation.add({ fromObservationId: s1.id, toObservationId: target.id, type: 'supports' })
    obsxa.relation.add({ fromObservationId: s2.id, toObservationId: target.id, type: 'supports' })
    obsxa.observation.promote(promoted.id, 'hypxa:p1:8')

    const convergent = obsxa.analysis.convergent('p1')
    expect(convergent.map(o => o.id)).toContain(target.id)

    const promotedList = obsxa.analysis.promoted('p1')
    expect(promotedList.map(o => o.id)).toContain(promoted.id)
  })

  it('computes triage ranking', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const high = obsxa.observation.add({
      projectId: 'p1',
      title: 'High signal',
      source: 'E1',
      confidence: 95,
      evidenceStrength: 90,
      novelty: 88,
      uncertainty: 10,
    })
    const low = obsxa.observation.add({
      projectId: 'p1',
      title: 'Weak signal',
      source: 'E2',
      confidence: 40,
      evidenceStrength: 30,
      novelty: 20,
      uncertainty: 80,
    })
    obsxa.relation.add({ fromObservationId: low.id, toObservationId: high.id, type: 'supports' })

    const rows = obsxa.analysis.triage('p1', 10, 'triage')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.observation.id).toBe(high.id)
    expect(rows[1]?.observation.id).toBe(low.id)
  })

  it('scans duplicate candidates and merges observations', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const a = obsxa.observation.add({
      projectId: 'p1',
      title: 'Repeated modulo residue in bits 12-16',
      description: 'Pattern appears in repeated scans',
      source: 'scan:1',
      tags: ['bits', 'mod'],
      confidence: 70,
    })
    const b = obsxa.observation.add({
      projectId: 'p1',
      title: 'Repeated modulo residue in bits 12-16',
      description: 'Pattern appears in repeated scans',
      source: 'scan:2',
      tags: ['mod', 'bits'],
      confidence: 90,
    })

    const scan = obsxa.dedup.scan('p1')
    expect(scan.checkedPairs).toBe(1)
    expect(scan.candidates.length).toBe(1)
    expect(scan.candidates[0]?.reason).toBe('exact_fingerprint')

    const merged = obsxa.dedup.merge(a.id, b.id, {
      confidenceStrategy: 'average',
      relationType: 'duplicate_of',
      relationConfidence: 99,
    })

    expect(merged.primary.id).toBe(a.id)
    expect(merged.primary.frequency).toBe(2)
    expect(merged.primary.confidence).toBe(80)
    expect(merged.merged.status).toBe('archived')
    expect(merged.relation?.type).toBe('duplicate_of')

    const openCandidates = obsxa.dedup.candidates('p1', 'open')
    expect(openCandidates).toHaveLength(0)
    const resolvedCandidates = obsxa.dedup.candidates('p1', 'resolved')
    expect(resolvedCandidates).toHaveLength(1)
  })

  it('reviews duplicate candidates and records decision event', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    obsxa.observation.add({ projectId: 'p1', title: 'A', description: 'x', source: 'E1' })
    obsxa.observation.add({ projectId: 'p1', title: 'A', description: 'x', source: 'E2' })
    const scan = obsxa.dedup.scan('p1')
    const candidate = scan.candidates[0]
    expect(candidate).toBeDefined()

    const review = obsxa.dedup.review(candidate!.id, 'dismissed', 'false positive')
    expect(review.candidate.status).toBe('dismissed')
    expect(review.event.reason).toBe('false positive')
  })

  it('stores and retrieves observation context', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({
      projectId: 'p1',
      title: 'Sensor reading',
      source: 'station-7',
      context: JSON.stringify({ temperature: 22.5, humidity: 45, instrument: 'DHT22', location: 'lab-3' }),
    })
    expect(obs.context).not.toBeNull()
    const parsed = JSON.parse(obs.context!)
    expect(parsed.instrument).toBe('DHT22')
    expect(parsed.temperature).toBe(22.5)

    const fetched = obsxa.observation.get(obs.id)
    expect(fetched?.context).toBe(obs.context)
  })

  it('tracks edit history on updates', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const obs = obsxa.observation.add({ projectId: 'p1', title: 'A', source: 'E1', confidence: 50 })

    obsxa.observation.update(obs.id, { title: 'A+', confidence: 88 })
    obsxa.observation.update(obs.id, { confidence: 95, context: '{"env":"prod"}' })

    const edits = obsxa.observation.edits(obs.id)
    expect(edits.length).toBeGreaterThanOrEqual(3)

    const titleEdit = edits.find(e => e.field === 'title')
    expect(titleEdit).toBeDefined()
    expect(titleEdit!.oldValue).toBe('A')
    expect(titleEdit!.newValue).toBe('A+')

    const confEdits = edits.filter(e => e.field === 'confidence')
    expect(confEdits).toHaveLength(2)
    expect(confEdits[0]!.oldValue).toBe('50')
    expect(confEdits[0]!.newValue).toBe('88')
    expect(confEdits[1]!.oldValue).toBe('88')
    expect(confEdits[1]!.newValue).toBe('95')

    const contextEdit = edits.find(e => e.field === 'context')
    expect(contextEdit).toBeDefined()
    expect(contextEdit!.oldValue).toBeNull()
    expect(contextEdit!.newValue).toBe('{"env":"prod"}')
  })

  it('dedup detects near-text duplicates via trigram similarity', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    obsxa.observation.add({
      projectId: 'p1',
      title: 'Temperature spike detected at station seven',
      description: 'Unusual reading above threshold',
      source: 'sensor-a',
      tags: ['temperature'],
    })
    obsxa.observation.add({
      projectId: 'p1',
      title: 'Temperature spike detected at station 7',
      description: 'Unusual reading above the threshold',
      source: 'sensor-b',
      tags: ['temperature'],
    })

    const scan = obsxa.dedup.scan('p1', 0.5)
    expect(scan.candidates.length).toBe(1)
    expect(scan.candidates[0]?.reason).toBe('near_text')
    expect(scan.candidates[0]?.score).toBeGreaterThan(0.5)
  })

  it('dedup detects exact sourceRef matches', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    obsxa.observation.add({
      projectId: 'p1',
      title: 'Event from pipeline A',
      source: 'pipeline-a',
      sourceRef: 'evt:12345',
    })
    obsxa.observation.add({
      projectId: 'p1',
      title: 'Same event from pipeline B',
      source: 'pipeline-b',
      sourceRef: 'evt:12345',
    })

    const scan = obsxa.dedup.scan('p1')
    expect(scan.candidates.length).toBe(1)
    expect(scan.candidates[0]?.reason).toBe('exact_source_ref')
    expect(scan.candidates[0]?.score).toBe(1)
  })

  it('imports and batch-updates observations', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    const imported = obsxa.observation.addMany([
      { projectId: 'p1', title: 'Imported A', source: 'I1', evidenceStrength: 80 },
      { projectId: 'p1', title: 'Imported B', source: 'I2', status: 'dismissed' },
    ])
    expect(imported).toHaveLength(2)
    expect(imported[1]?.status).toBe('dismissed')

    const updated = obsxa.observation.updateMany([
      { id: imported[0]!.id, novelty: 91, uncertainty: 12 },
      { id: imported[1]!.id, title: 'Imported B2' },
    ])
    expect(updated[0]?.novelty).toBe(91)
    expect(updated[1]?.title).toBe('Imported B2')
  })

  it('creates backup before migration when schema is older', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    obsxa.observation.add({ projectId: 'p1', title: 'Persisted', source: 'E1' })
    obsxa.close()
    obsxaClosed = true

    const sqlite = new Database(dbPath)
    sqlite.prepare(`
      INSERT INTO obsxa_meta (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run('schema_version', '1')
    sqlite.close()

    const reopened = createObsxa({ db: dbPath, backupDir: dbDir })
    const rows = reopened.observation.list('p1')
    expect(rows).toHaveLength(1)
    reopened.close()

    const backupFiles = readdirSync(dbDir).filter(name => name.startsWith('test.db.bak.'))
    expect(backupFiles.length).toBeGreaterThan(0)
  })

  it('fails fast when database schema is newer than runtime', () => {
    obsxa.close()
    obsxaClosed = true
    const sqlite = new Database(dbPath)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS obsxa_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    sqlite.prepare(`
      INSERT INTO obsxa_meta (key, value, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run('schema_version', '999')
    sqlite.close()

    expect(() => createObsxa({ db: dbPath })).toThrow(/newer than supported/)
  })

  it('backs up and restores database files', () => {
    obsxa.project.add({ id: 'p1', name: 'Obs Project' })
    obsxa.observation.add({ projectId: 'p1', title: 'Before backup', source: 'E1' })
    obsxa.close()
    obsxaClosed = true

    const backupBase = join(dbDir, 'manual-backup.db')
    const backup = backupDatabase(dbPath, backupBase)
    expect(backup.files.length).toBeGreaterThan(0)

    writeFileSync(dbPath, '')
    const restored = restoreDatabase(dbPath, backupBase)
    expect(restored.files.length).toBeGreaterThan(0)
    expect(restored.preRestoreBackup).not.toBeNull()

    const reopened = createObsxa({ db: dbPath })
    const rows = reopened.observation.list('p1')
    expect(rows).toHaveLength(1)
    reopened.close()
  })
})
