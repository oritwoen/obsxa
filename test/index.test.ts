import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDatabase, restoreDatabase } from "../src/backup.ts";
import { createObsxa, type ObsxaInstance } from "../src/index.ts";

async function setSchemaVersion(dbPath: string, version: number): Promise<void> {
  const client = createClient({ url: `file:${dbPath}` });
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS obsxa_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    await client.execute({
      sql: `INSERT INTO obsxa_meta (key, value, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      args: ["schema_version", String(version)],
    });
  } finally {
    client.close();
  }
}

describe("obsxa", () => {
  let dbDir: string;
  let dbPath: string;
  let obsxa: ObsxaInstance;
  let obsxaClosed: boolean;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-"));
    dbPath = join(dbDir, "test.db");
    obsxa = await createObsxa({ db: dbPath });
    obsxaClosed = false;
  });

  afterEach(async () => {
    if (!obsxaClosed) {
      await obsxa.close();
      obsxaClosed = true;
    }
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("creates project", async () => {
    const project = await obsxa.project.add({ id: "p1", name: "Obs Project" });
    expect(project.id).toBe("p1");
    expect((await obsxa.project.get("p1"))?.name).toBe("Obs Project");
  });

  it("adds observation", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const observation = await obsxa.observation.add({
      projectId: "p1",
      title: "Noticed repeated modulo residue",
      source: "E001",
      tags: ["mod", "residue"],
    });
    expect(observation.id).toBeGreaterThan(0);
    expect(observation.tags).toContain("mod");
  });

  it("lists observations with filters", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const o1 = await obsxa.observation.add({
      projectId: "p1",
      title: "A",
      source: "E1",
      type: "pattern",
    });
    await obsxa.observation.add({ projectId: "p1", title: "B", source: "E2", type: "anomaly" });
    await obsxa.observation.dismiss(o1.id, { reasonCode: "noise" });
    expect(await obsxa.observation.list("p1")).toHaveLength(2);
    expect(await obsxa.observation.list("p1", { status: "dismissed" })).toHaveLength(1);
    expect(await obsxa.observation.list("p1", { type: "anomaly" })).toHaveLength(1);
  });

  it("updates observation", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const updated = await obsxa.observation.update(obs.id, {
      title: "A+",
      confidence: 88,
      tags: ["updated"],
    });
    expect(updated.title).toBe("A+");
    expect(updated.confidence).toBe(88);
    expect(updated.updatedAt).not.toBeNull();
  });

  it("dismisses active observation", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const dismissed = await obsxa.observation.dismiss(obs.id, {
      reasonCode: "noise",
      reasonNote: "No signal",
    });
    expect(dismissed.status).toBe("dismissed");
    const transitions = await obsxa.observation.transitions(obs.id);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.reasonCode).toBe("noise");
  });

  it("archives active observation with reason", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const archived = await obsxa.observation.archive(obs.id, { reasonCode: "manual_review" });
    expect(archived.status).toBe("archived");
    expect(archived.archivedReasonCode).toBe("manual_review");
  });

  it("increments observation frequency", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const bumped = await obsxa.observation.incrementFrequency(obs.id);
    expect(bumped.frequency).toBe(2);
    expect(bumped.updatedAt).not.toBeNull();
  });

  it("promotes observation", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const promoted = await obsxa.observation.promote(obs.id, "hypxa:p1:3");
    expect(promoted.status).toBe("promoted");
    expect(promoted.promotedTo).toBe("hypxa:p1:3");
  });

  it("adds relations and rejects self/duplicate", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const a = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const b = await obsxa.observation.add({ projectId: "p1", title: "B", source: "E2" });
    const relation = await obsxa.relation.add({
      fromObservationId: a.id,
      toObservationId: b.id,
      type: "supports",
    });
    expect(relation.id).toBeGreaterThan(0);
    expect(relation.confidence).toBe(100);
    await expect(
      obsxa.relation.add({ fromObservationId: a.id, toObservationId: a.id, type: "supports" }),
    ).rejects.toThrow();
    const dup = await obsxa.relation.add({
      fromObservationId: a.id,
      toObservationId: b.id,
      type: "supports",
    });
    expect(dup.id).toBe(relation.id);
  });

  it("stores relation confidence and notes", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const a = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const b = await obsxa.observation.add({ projectId: "p1", title: "B", source: "E2" });

    const relation = await obsxa.relation.add({
      fromObservationId: a.id,
      toObservationId: b.id,
      type: "same_signal_as",
      confidence: 83,
      notes: "Same source family",
    });

    expect(relation.confidence).toBe(83);
    expect(relation.notes).toBe("Same source family");
  });

  it("handles clusters and membership", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const o1 = await obsxa.observation.add({ projectId: "p1", title: "A", source: "E1" });
    const o2 = await obsxa.observation.add({ projectId: "p1", title: "B", source: "E2" });
    const cluster = await obsxa.cluster.add({ projectId: "p1", name: "Signals" });
    const m1 = await obsxa.cluster.addMember(cluster.id, o1.id);
    const m2 = await obsxa.cluster.addMember(cluster.id, o1.id);
    await obsxa.cluster.addMember(cluster.id, o2.id);
    expect(m2.id).toBe(m1.id);
    expect(await obsxa.cluster.list("p1")).toHaveLength(1);
    expect(await obsxa.cluster.listMembers(cluster.id)).toHaveLength(2);
  });

  it("searches observations via fts and fallback", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({
      projectId: "p1",
      title: "Quantum anomaly",
      description: "Euler's signal",
      source: "scan:1",
      tags: ["quantum"],
    });
    const fts = await obsxa.search.search("Quantum", "p1");
    expect(fts).toHaveLength(1);
    const fallback = await obsxa.search.search("'", "p1");
    expect(fallback.length).toBeGreaterThan(0);
  });

  it("does not swallow non-recoverable fts errors", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({
      projectId: "p1",
      title: "Quantum anomaly",
      source: "scan:1",
    });

    const client = createClient({ url: `file:${dbPath}` });
    try {
      await client.execute("DROP TABLE observations_fts");
    } finally {
      client.close();
    }

    await expect(obsxa.search.search("Quantum", "p1")).rejects.toThrow(/observations_fts/i);
  });

  it("computes analysis stats, frequent, isolated, unpromoted", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const a = await obsxa.observation.add({
      projectId: "p1",
      title: "A",
      source: "E1",
      type: "pattern",
    });
    const b = await obsxa.observation.add({
      projectId: "p1",
      title: "B",
      source: "E2",
      type: "anomaly",
    });
    const c = await obsxa.observation.add({
      projectId: "p1",
      title: "C",
      source: "E3",
      type: "measurement",
    });
    await obsxa.observation.incrementFrequency(a.id);
    await obsxa.observation.promote(b.id, "hypxa:p1:4");
    await obsxa.relation.add({ fromObservationId: a.id, toObservationId: b.id, type: "supports" });

    const stats = await obsxa.analysis.stats("p1");
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.promoted).toBe(1);
    expect(stats.byType.measurement).toBe(1);

    const frequent = await obsxa.analysis.frequent("p1");
    expect(frequent).toHaveLength(1);
    expect(frequent[0]?.id).toBe(a.id);

    const isolated = await obsxa.analysis.isolated("p1");
    expect(isolated.map((o) => o.id)).toContain(c.id);

    const unpromoted = await obsxa.analysis.unpromoted("p1");
    expect(unpromoted.map((o) => o.id)).toContain(a.id);
    expect(unpromoted.map((o) => o.id)).toContain(c.id);
    expect(unpromoted.map((o) => o.id)).not.toContain(b.id);
  });

  it("computes convergent and promoted analysis", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const target = await obsxa.observation.add({ projectId: "p1", title: "Target", source: "E0" });
    const s1 = await obsxa.observation.add({ projectId: "p1", title: "Support 1", source: "E1" });
    const s2 = await obsxa.observation.add({ projectId: "p1", title: "Support 2", source: "E2" });
    const promoted = await obsxa.observation.add({
      projectId: "p1",
      title: "Promoted",
      source: "E3",
    });
    await obsxa.relation.add({
      fromObservationId: s1.id,
      toObservationId: target.id,
      type: "supports",
    });
    await obsxa.relation.add({
      fromObservationId: s2.id,
      toObservationId: target.id,
      type: "supports",
    });
    await obsxa.observation.promote(promoted.id, "hypxa:p1:8");

    const convergent = await obsxa.analysis.convergent("p1");
    expect(convergent.map((o) => o.id)).toContain(target.id);

    const promotedList = await obsxa.analysis.promoted("p1");
    expect(promotedList.map((o) => o.id)).toContain(promoted.id);
  });

  it("computes triage ranking", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const high = await obsxa.observation.add({
      projectId: "p1",
      title: "High signal",
      source: "E1",
      confidence: 95,
      evidenceStrength: 90,
      novelty: 88,
      uncertainty: 10,
    });
    const low = await obsxa.observation.add({
      projectId: "p1",
      title: "Weak signal",
      source: "E2",
      confidence: 40,
      evidenceStrength: 30,
      novelty: 20,
      uncertainty: 80,
    });
    await obsxa.relation.add({
      fromObservationId: low.id,
      toObservationId: high.id,
      type: "supports",
    });

    const rows = await obsxa.analysis.triage("p1", 10, "triage");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.observation.id).toBe(high.id);
    expect(rows[1]?.observation.id).toBe(low.id);
  });

  it("scans duplicate candidates and merges observations", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const a = await obsxa.observation.add({
      projectId: "p1",
      title: "Repeated modulo residue in bits 12-16",
      description: "Pattern appears in repeated scans",
      source: "scan:1",
      tags: ["bits", "mod"],
      confidence: 70,
    });
    const b = await obsxa.observation.add({
      projectId: "p1",
      title: "Repeated modulo residue in bits 12-16",
      description: "Pattern appears in repeated scans",
      source: "scan:2",
      tags: ["mod", "bits"],
      confidence: 90,
    });

    const scan = await obsxa.dedup.scan("p1");
    expect(scan.checkedPairs).toBe(1);
    expect(scan.candidates.length).toBe(1);
    expect(scan.candidates[0]?.reason).toBe("exact_fingerprint");

    const merged = await obsxa.dedup.merge(a.id, b.id, {
      confidenceStrategy: "average",
      relationType: "duplicate_of",
      relationConfidence: 99,
    });

    expect(merged.primary.id).toBe(a.id);
    expect(merged.primary.frequency).toBe(2);
    expect(merged.primary.confidence).toBe(80);
    expect(merged.merged.status).toBe("archived");
    expect(merged.relation?.type).toBe("duplicate_of");

    const openCandidates = await obsxa.dedup.candidates("p1", "open");
    expect(openCandidates).toHaveLength(0);
    const resolvedCandidates = await obsxa.dedup.candidates("p1", "resolved");
    expect(resolvedCandidates).toHaveLength(1);
  });

  it("reviews duplicate candidates and records decision event", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({ projectId: "p1", title: "A", description: "x", source: "E1" });
    await obsxa.observation.add({ projectId: "p1", title: "A", description: "x", source: "E2" });
    const scan = await obsxa.dedup.scan("p1");
    const candidate = scan.candidates[0];
    expect(candidate).toBeDefined();

    const review = await obsxa.dedup.review(candidate!.id, "dismissed", "false positive");
    expect(review.candidate.status).toBe("dismissed");
    expect(review.event.reason).toBe("false positive");
  });

  it("stores and retrieves observation context", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({
      projectId: "p1",
      title: "Sensor reading",
      source: "station-7",
      context: JSON.stringify({
        temperature: 22.5,
        humidity: 45,
        instrument: "DHT22",
        location: "lab-3",
      }),
    });
    expect(obs.context).not.toBeNull();
    const parsed = JSON.parse(obs.context!);
    expect(parsed.instrument).toBe("DHT22");
    expect(parsed.temperature).toBe(22.5);

    const fetched = await obsxa.observation.get(obs.id);
    expect(fetched?.context).toBe(obs.context);
  });

  it("tracks edit history on updates", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const obs = await obsxa.observation.add({
      projectId: "p1",
      title: "A",
      source: "E1",
      confidence: 50,
    });

    await obsxa.observation.update(obs.id, { title: "A+", confidence: 88 });
    await obsxa.observation.update(obs.id, { confidence: 95, context: '{"env":"prod"}' });

    const edits = await obsxa.observation.edits(obs.id);
    expect(edits.length).toBeGreaterThanOrEqual(3);

    const titleEdit = edits.find((e) => e.field === "title");
    expect(titleEdit).toBeDefined();
    expect(titleEdit!.oldValue).toBe("A");
    expect(titleEdit!.newValue).toBe("A+");

    const confEdits = edits.filter((e) => e.field === "confidence");
    expect(confEdits).toHaveLength(2);
    expect(confEdits[0]!.oldValue).toBe("50");
    expect(confEdits[0]!.newValue).toBe("88");
    expect(confEdits[1]!.oldValue).toBe("88");
    expect(confEdits[1]!.newValue).toBe("95");

    const contextEdit = edits.find((e) => e.field === "context");
    expect(contextEdit).toBeDefined();
    expect(contextEdit!.oldValue).toBeNull();
    expect(contextEdit!.newValue).toBe('{"env":"prod"}');
  });

  it("dedup detects near-text duplicates via trigram similarity", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({
      projectId: "p1",
      title: "Temperature spike detected at station seven",
      description: "Unusual reading above threshold",
      source: "sensor-a",
      tags: ["temperature"],
    });
    await obsxa.observation.add({
      projectId: "p1",
      title: "Temperature spike detected at station 7",
      description: "Unusual reading above the threshold",
      source: "sensor-b",
      tags: ["temperature"],
    });

    const scan = await obsxa.dedup.scan("p1", 0.5);
    expect(scan.candidates.length).toBe(1);
    expect(scan.candidates[0]?.reason).toBe("near_text");
    expect(scan.candidates[0]?.score).toBeGreaterThan(0.5);
  });

  it("dedup detects exact sourceRef matches", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({
      projectId: "p1",
      title: "Event from pipeline A",
      source: "pipeline-a",
      sourceRef: "evt:12345",
    });
    await obsxa.observation.add({
      projectId: "p1",
      title: "Same event from pipeline B",
      source: "pipeline-b",
      sourceRef: "evt:12345",
    });

    const scan = await obsxa.dedup.scan("p1");
    expect(scan.candidates.length).toBe(1);
    expect(scan.candidates[0]?.reason).toBe("exact_source_ref");
    expect(scan.candidates[0]?.score).toBe(1);
  });

  it("imports and batch-updates observations", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    const imported = await obsxa.observation.addMany([
      { projectId: "p1", title: "Imported A", source: "I1", evidenceStrength: 80 },
      { projectId: "p1", title: "Imported B", source: "I2", status: "dismissed" },
    ]);
    expect(imported).toHaveLength(2);
    expect(imported[1]?.status).toBe("dismissed");

    const updated = await obsxa.observation.updateMany([
      { id: imported[0]!.id, novelty: 91, uncertainty: 12 },
      { id: imported[1]!.id, title: "Imported B2" },
    ]);
    expect(updated[0]?.novelty).toBe(91);
    expect(updated[1]?.title).toBe("Imported B2");
  });

  it("creates backup before migration when schema is older", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({ projectId: "p1", title: "Persisted", source: "E1" });
    await obsxa.close();
    obsxaClosed = true;

    await setSchemaVersion(dbPath, 0);

    const reopened = await createObsxa({ db: dbPath, backupDir: dbDir });
    const rows = await reopened.observation.list("p1");
    expect(rows).toHaveLength(1);
    await reopened.close();

    const backupFiles = readdirSync(dbDir).filter((name) => name.startsWith("test.db.bak."));
    expect(backupFiles.length).toBeGreaterThan(0);
  });

  it("fails fast when database schema is newer than runtime", async () => {
    await obsxa.close();
    obsxaClosed = true;

    await setSchemaVersion(dbPath, 999);

    await expect(createObsxa({ db: dbPath })).rejects.toThrow(/newer than supported/);
  });

  it("backs up and restores database files", async () => {
    await obsxa.project.add({ id: "p1", name: "Obs Project" });
    await obsxa.observation.add({ projectId: "p1", title: "Before backup", source: "E1" });
    await obsxa.close();
    obsxaClosed = true;

    const backupBase = join(dbDir, "manual-backup.db");
    const backup = backupDatabase(dbPath, backupBase);
    expect(backup.files.length).toBeGreaterThan(0);

    writeFileSync(dbPath, "");
    const restored = restoreDatabase(dbPath, backupBase);
    expect(restored.files.length).toBeGreaterThan(0);
    expect(restored.preRestoreBackup).not.toBeNull();

    const reopened = await createObsxa({ db: dbPath });
    const rows = await reopened.observation.list("p1");
    expect(rows).toHaveLength(1);
    await reopened.close();
  });
});
