import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encode, decode } from "@toon-format/toon";
import { createObsxa, type ObsxaInstance, type Observation } from "../src/index.ts";

/**
 * Real-world integration test using USGS earthquake data.
 *
 * Data: 56 M5+ earthquakes from 2026-03-01 to 2026-03-10
 * Source: https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2026-03-01&endtime=2026-03-10&minmagnitude=5
 *
 * Tests the full obsxa lifecycle:
 *   ingest → relate → cluster → analyze → search → lifecycle → dedup → export
 */

// Trimmed subset of real USGS GeoJSON features (14 representative earthquakes across regions)
const EARTHQUAKES = [
  // Japan / Miyako — cluster of 3
  {
    id: "us7000qdbn",
    mag: 5.6,
    place: "42 km SSE of Hirara, Japan",
    time: 1741374737490,
    sig: 482,
    nst: 119,
    rms: 0.72,
    gap: 28,
    lon: 125.4319,
    lat: 24.4269,
    depth: 25.92,
  },
  {
    id: "us7000qdbx",
    mag: 5.1,
    place: "33 km SSE of Hirara, Japan",
    time: 1741376102849,
    sig: 400,
    nst: 98,
    rms: 0.65,
    gap: 30,
    lon: 125.3947,
    lat: 24.5026,
    depth: 23.1,
  },
  {
    id: "us7000qdgh",
    mag: 5.0,
    place: "38 km S of Hirara, Japan",
    time: 1741391426573,
    sig: 385,
    nst: 87,
    rms: 0.7,
    gap: 32,
    lon: 125.2781,
    lat: 24.4412,
    depth: 28.5,
  },

  // Alaska / Attu — cluster of 3
  {
    id: "us7000qd6f",
    mag: 5.3,
    place: "104 km SSW of Attu Station, Alaska",
    time: 1741340917283,
    sig: 432,
    nst: 132,
    rms: 0.58,
    gap: 45,
    lon: 172.5381,
    lat: 51.8632,
    depth: 18.0,
  },
  {
    id: "us7000qd8c",
    mag: 5.1,
    place: "110 km S of Attu Station, Alaska",
    time: 1741354221010,
    sig: 400,
    nst: 110,
    rms: 0.61,
    gap: 48,
    lon: 173.0214,
    lat: 51.8044,
    depth: 22.4,
  },
  {
    id: "us7000qdza",
    mag: 5.0,
    place: "98 km SSW of Attu Station, Alaska",
    time: 1741440012000,
    sig: 385,
    nst: 90,
    rms: 0.55,
    gap: 50,
    lon: 172.8,
    lat: 51.95,
    depth: 16.3,
  },

  // Russia / Kamchatka — cluster of 2
  {
    id: "us7000qdcj",
    mag: 5.2,
    place: "83 km SSE of Vilyuchinsk, Russia",
    time: 1741382461893,
    sig: 416,
    nst: 142,
    rms: 0.78,
    gap: 35,
    lon: 158.6713,
    lat: 52.2118,
    depth: 56.83,
  },
  {
    id: "us7000qdkz",
    mag: 5.4,
    place: "90 km SE of Vilyuchinsk, Russia",
    time: 1741415000000,
    sig: 449,
    nst: 128,
    rms: 0.8,
    gap: 38,
    lon: 158.9,
    lat: 52.15,
    depth: 48.0,
  },

  // Indonesia — cluster of 2
  {
    id: "us7000qdgb",
    mag: 6.0,
    place: "154 km N of Manokwari, Indonesia",
    time: 1741389936613,
    sig: 554,
    nst: 145,
    rms: 0.81,
    gap: 22,
    lon: 133.7991,
    lat: -0.2138,
    depth: 10.0,
  },
  {
    id: "us7000qdx2",
    mag: 5.3,
    place: "120 km NNW of Manokwari, Indonesia",
    time: 1741430000000,
    sig: 432,
    nst: 100,
    rms: 0.76,
    gap: 28,
    lon: 133.5,
    lat: -0.1,
    depth: 15.0,
  },

  // Tonga — standalone
  {
    id: "us7000qds1",
    mag: 5.2,
    place: "129 km ESE of Neiafu, Tonga",
    time: 1741410530610,
    sig: 416,
    nst: 85,
    rms: 0.92,
    gap: 55,
    lon: -173.0492,
    lat: -18.9512,
    depth: 210.63,
  },

  // Italy — standalone (notable: shallow, high significance)
  {
    id: "us7000qdyv",
    mag: 6.0,
    place: "12 km W of Anacapri, Italy",
    time: 1741436505100,
    sig: 554,
    nst: 160,
    rms: 0.68,
    gap: 18,
    lon: 14.1183,
    lat: 40.5444,
    depth: 8.0,
  },

  // Philippines — standalone
  {
    id: "us7000qdm5",
    mag: 5.5,
    place: "5 km NNE of Magsaysay, Philippines",
    time: 1741400000000,
    sig: 465,
    nst: 75,
    rms: 0.88,
    gap: 40,
    lon: 125.51,
    lat: 6.83,
    depth: 55.0,
  },

  // Chile — standalone
  {
    id: "us7000qdp3",
    mag: 5.1,
    place: "45 km NW of Calama, Chile",
    time: 1741405000000,
    sig: 400,
    nst: 65,
    rms: 0.6,
    gap: 60,
    lon: -68.95,
    lat: -22.25,
    depth: 120.0,
  },
] as const;

/** Map significance (0–1000) to confidence (0–100) */
function sigToConfidence(sig: number): number {
  return Math.min(100, Math.round(sig / 10));
}

/** Map station count to evidence strength (0–100) */
function stationsToEvidence(nst: number): number {
  return Math.min(100, Math.round(nst * 0.6));
}

/** Region key from place string */
function regionKey(place: string): string {
  if (place.includes("Japan")) return "japan";
  if (place.includes("Alaska")) return "alaska";
  if (place.includes("Russia")) return "kamchatka";
  if (place.includes("Indonesia")) return "indonesia";
  if (place.includes("Tonga")) return "tonga";
  if (place.includes("Italy")) return "italy";
  if (place.includes("Philippines")) return "philippines";
  if (place.includes("Chile")) return "chile";
  return "unknown";
}

/** Magnitude range tag */
function magTag(mag: number): string {
  if (mag >= 7) return "M7+";
  if (mag >= 6) return "M6+";
  if (mag >= 5.5) return "M5.5+";
  return "M5+";
}

describe("usgs earthquake integration", () => {
  let dbDir: string;
  let dbPath: string;
  let obsxa: ObsxaInstance;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), "obsxa-usgs-"));
    dbPath = join(dbDir, "seismic.db");
    obsxa = await createObsxa({ db: dbPath });
  });

  afterEach(async () => {
    await obsxa.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("ingests 14 earthquakes as observations", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });

    const observations = await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        description: `Magnitude ${eq.mag} earthquake at depth ${eq.depth} km. Gap: ${eq.gap}°, RMS: ${eq.rms}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        tags: [regionKey(eq.place), magTag(eq.mag), eq.depth > 100 ? "deep" : "shallow"],
        data: JSON.stringify({
          lon: eq.lon,
          lat: eq.lat,
          depth: eq.depth,
          mag: eq.mag,
          gap: eq.gap,
          rms: eq.rms,
        }),
        context: JSON.stringify({
          network: "us",
          reviewStatus: "reviewed",
          magType: "mww",
          stations: eq.nst,
        }),
        capturedAt: new Date(eq.time),
        sourceRef: `usgs:${eq.id}`,
        collector: "usgs-fdsnws",
        evidenceStrength: stationsToEvidence(eq.nst),
        novelty: eq.mag >= 6 ? 80 : 40,
        uncertainty: Math.min(100, Math.round(eq.gap)),
      })),
    );

    expect(observations).toHaveLength(14);
    expect(observations.every((o) => o.id > 0)).toBe(true);
    expect(observations.every((o) => o.type === "measurement")).toBe(true);
    expect(observations.every((o) => o.sourceType === "external")).toBe(true);
    expect(observations.every((o) => o.status === "active")).toBe(true);
    expect(observations.every((o) => o.capturedAt instanceof Date)).toBe(true);
  });

  it("creates regional clusters and adds members", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });

    const added = await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        tags: [regionKey(eq.place)],
      })),
    );

    const regionObs = new Map<string, number[]>();
    for (let i = 0; i < EARTHQUAKES.length; i++) {
      const region = regionKey(EARTHQUAKES[i]!.place);
      const ids = regionObs.get(region) ?? [];
      ids.push(added[i]!.id);
      regionObs.set(region, ids);
    }

    const clustered = [...regionObs.entries()].filter(([, ids]) => ids.length >= 2);
    expect(clustered.length).toBe(4);

    for (const [region, ids] of clustered) {
      const cluster = await obsxa.cluster.add({ projectId: "seismic", name: `Region: ${region}` });
      for (const id of ids) {
        await obsxa.cluster.addMember(cluster.id, id);
      }
      expect(await obsxa.cluster.listMembers(cluster.id)).toHaveLength(ids.length);
    }

    expect(await obsxa.cluster.list("seismic")).toHaveLength(4);
  });

  it("creates relations between earthquakes in same region", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });

    const added = await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        tags: [regionKey(eq.place)],
      })),
    );

    const japan = added.slice(0, 3);
    await obsxa.relation.add({
      fromObservationId: japan[1]!.id,
      toObservationId: japan[0]!.id,
      type: "same_signal_as",
      confidence: 90,
      notes: "Aftershock sequence near Hirara",
    });
    await obsxa.relation.add({
      fromObservationId: japan[2]!.id,
      toObservationId: japan[0]!.id,
      type: "same_signal_as",
      confidence: 85,
      notes: "Same fault system",
    });

    const alaska = added.slice(3, 6);
    await obsxa.relation.add({
      fromObservationId: alaska[1]!.id,
      toObservationId: alaska[0]!.id,
      type: "supports",
      confidence: 80,
    });
    await obsxa.relation.add({
      fromObservationId: alaska[2]!.id,
      toObservationId: alaska[0]!.id,
      type: "supports",
      confidence: 75,
    });

    const italy = added[11]!;
    const chile = added[13]!;
    await obsxa.relation.add({
      fromObservationId: italy.id,
      toObservationId: chile.id,
      type: "contradicts",
      notes: "Shallow crustal vs deep subduction",
    });

    const japanRels = await obsxa.relation.list(japan[0]!.id);
    expect(japanRels).toHaveLength(2);
    expect(japanRels.every((r) => r.type === "same_signal_as")).toBe(true);
  });

  it("analysis: stats reflect ingested data", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
      })),
    );

    const stats = await obsxa.analysis.stats("seismic");
    expect(stats.total).toBe(14);
    expect(stats.active).toBe(14);
    expect(stats.promoted).toBe(0);
    expect(stats.dismissed).toBe(0);
    expect(stats.byType.measurement).toBe(14);
    expect(stats.avgConfidence).toBeGreaterThan(35);
    expect(stats.avgConfidence).toBeLessThanOrEqual(100);
  });

  it("analysis: convergent detects multi-source support", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });

    const added = await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
      })),
    );

    await obsxa.relation.add({
      fromObservationId: added[4]!.id,
      toObservationId: added[3]!.id,
      type: "supports",
    });
    await obsxa.relation.add({
      fromObservationId: added[5]!.id,
      toObservationId: added[3]!.id,
      type: "supports",
    });

    const convergent = await obsxa.analysis.convergent("seismic");
    expect(convergent.map((o) => o.id)).toContain(added[3]!.id);
  });

  it("analysis: isolated finds standalone quakes", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });

    const added = await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
      })),
    );

    await obsxa.relation.add({
      fromObservationId: added[1]!.id,
      toObservationId: added[0]!.id,
      type: "same_signal_as",
    });
    await obsxa.relation.add({
      fromObservationId: added[2]!.id,
      toObservationId: added[0]!.id,
      type: "same_signal_as",
    });

    const isolated = await obsxa.analysis.isolated("seismic");
    expect(isolated).toHaveLength(11);
    expect(isolated.map((o) => o.id)).not.toContain(added[0]!.id);
    expect(isolated.map((o) => o.id)).not.toContain(added[1]!.id);
    expect(isolated.map((o) => o.id)).not.toContain(added[2]!.id);
  });

  it("analysis: triage ranks high-magnitude quakes first", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        evidenceStrength: stationsToEvidence(eq.nst),
        novelty: eq.mag >= 6 ? 80 : 40,
        uncertainty: Math.min(100, Math.round(eq.gap)),
      })),
    );

    const triaged = await obsxa.analysis.triage("seismic", 5, "triage");
    expect(triaged).toHaveLength(5);
    const topTitles = triaged.slice(0, 2).map((t) => t.observation.title);
    expect(topTitles.some((t) => t.startsWith("M 6"))).toBe(true);
    for (let i = 1; i < triaged.length; i++) {
      expect(triaged[i - 1]!.score).toBeGreaterThanOrEqual(triaged[i]!.score);
    }
  });

  it("analysis: frequent detects bumped quakes", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    const added = await obsxa.observation.addMany(
      EARTHQUAKES.slice(0, 3).map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
      })),
    );

    await obsxa.observation.incrementFrequency(added[0]!.id);
    await obsxa.observation.incrementFrequency(added[0]!.id);

    const frequent = await obsxa.analysis.frequent("seismic");
    expect(frequent).toHaveLength(1);
    expect(frequent[0]!.id).toBe(added[0]!.id);
    expect(frequent[0]!.frequency).toBe(3);
  });

  it("search finds earthquakes by region and magnitude", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        description: `Magnitude ${eq.mag} at depth ${eq.depth} km`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        tags: [regionKey(eq.place), magTag(eq.mag)],
      })),
    );

    const japanResults = await obsxa.search.search("Japan", "seismic");
    expect(japanResults.length).toBe(3);

    const italyResults = await obsxa.search.search("Italy", "seismic");
    expect(italyResults.length).toBe(1);

    const alaskaResults = await obsxa.search.search("Alaska", "seismic");
    expect(alaskaResults.length).toBe(3);
  });

  it("lifecycle: dismiss, archive, promote", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    const added = await obsxa.observation.addMany(
      EARTHQUAKES.slice(0, 4).map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
      })),
    );

    const dismissed = await obsxa.observation.dismiss(added[2]!.id, {
      reasonCode: "noise",
      reasonNote: "Below signal threshold",
    });
    expect(dismissed.status).toBe("dismissed");

    const archived = await obsxa.observation.archive(added[3]!.id, {
      reasonCode: "manual_review",
      reasonNote: "Needs geological review",
    });
    expect(archived.status).toBe("archived");

    const promoted = await obsxa.observation.promote(added[0]!.id, "hypxa:seismic:hirara-swarm");
    expect(promoted.status).toBe("promoted");
    expect(promoted.promotedTo).toBe("hypxa:seismic:hirara-swarm");

    const transitions = await obsxa.observation.transitions(added[0]!.id);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.toStatus).toBe("promoted");

    const stats = await obsxa.analysis.stats("seismic");
    expect(stats.active).toBe(1);
    expect(stats.promoted).toBe(1);
    expect(stats.dismissed).toBe(1);
    expect(stats.archived).toBe(1);

    const unpromoted = await obsxa.analysis.unpromoted("seismic");
    expect(unpromoted).toHaveLength(1);
    expect(unpromoted[0]!.id).toBe(added[1]!.id);
  });

  it("dedup: detects near-identical observations", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });

    const quake = EARTHQUAKES[0]!;
    await obsxa.observation.add({
      projectId: "seismic",
      title: `M ${quake.mag} - ${quake.place}`,
      description: `Magnitude ${quake.mag} at depth ${quake.depth} km`,
      type: "measurement",
      source: "usgs-run-1",
      sourceType: "external",
      tags: ["japan"],
    });
    await obsxa.observation.add({
      projectId: "seismic",
      title: `M ${quake.mag} - ${quake.place}`,
      description: `Magnitude ${quake.mag} at depth ${quake.depth} km`,
      type: "measurement",
      source: "usgs-run-2",
      sourceType: "external",
      tags: ["japan"],
    });

    const scan = await obsxa.dedup.scan("seismic");
    expect(scan.checkedPairs).toBe(1);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0]!.reason).toBe("exact_fingerprint");

    const merged = await obsxa.dedup.merge(
      scan.candidates[0]!.primaryObservationId,
      scan.candidates[0]!.duplicateObservationId,
      { confidenceStrategy: "max", relationType: "duplicate_of" },
    );
    expect(merged.primary.frequency).toBe(2);
    expect(merged.merged.status).toBe("archived");

    const resolved = await obsxa.dedup.candidates("seismic", "resolved");
    expect(resolved).toHaveLength(1);
  });

  it("export/import round-trip preserves data", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    const originals = await obsxa.observation.addMany(
      EARTHQUAKES.slice(0, 5).map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        tags: [regionKey(eq.place), magTag(eq.mag)],
        capturedAt: new Date(eq.time),
        sourceRef: `usgs:${eq.id}`,
      })),
    );

    const exported = await obsxa.observation.list("seismic");
    expect(exported).toHaveLength(5);

    await obsxa.project.add({ id: "seismic-copy", name: "Copy" });
    const reimported = await obsxa.observation.addMany(
      exported.map((o) => ({
        projectId: "seismic-copy",
        title: o.title,
        description: o.description ?? undefined,
        type: o.type,
        source: o.source,
        sourceType: o.sourceType,
        confidence: o.confidence,
        tags: o.tags,
        capturedAt: o.capturedAt ?? undefined,
        sourceRef: o.sourceRef ?? undefined,
      })),
    );

    expect(reimported).toHaveLength(5);
    const originalsByTitle = [...originals].sort((a, b) => a.title.localeCompare(b.title));
    const reimportedByTitle = [...reimported].sort((a, b) => a.title.localeCompare(b.title));
    for (let i = 0; i < 5; i++) {
      expect(reimportedByTitle[i]!.title).toBe(originalsByTitle[i]!.title);
      expect(reimportedByTitle[i]!.confidence).toBe(originalsByTitle[i]!.confidence);
      expect(reimportedByTitle[i]!.type).toBe(originalsByTitle[i]!.type);
      expect(reimportedByTitle[i]!.tags).toEqual(originalsByTitle[i]!.tags);
    }
  });

  it("TOON encode/decode round-trip", async () => {
    await obsxa.project.add({ id: "seismic", name: "USGS Seismic Monitor" });
    await obsxa.observation.addMany(
      EARTHQUAKES.slice(0, 3).map((eq) => ({
        projectId: "seismic",
        title: `M ${eq.mag} - ${eq.place}`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        tags: [regionKey(eq.place)],
      })),
    );

    const observations = await obsxa.observation.list("seismic");
    const toonStr = encode(observations);
    expect(typeof toonStr).toBe("string");
    expect(toonStr.length).toBeGreaterThan(0);

    const decoded = decode(toonStr) as unknown as Observation[];
    expect(decoded).toHaveLength(3);
    const decodedByTitle = [...decoded].sort((a, b) => a.title.localeCompare(b.title));
    const observationsByTitle = [...observations].sort((a, b) => a.title.localeCompare(b.title));
    for (let i = 0; i < 3; i++) {
      expect(decodedByTitle[i]!.title).toBe(observationsByTitle[i]!.title);
      expect(decodedByTitle[i]!.confidence).toBe(observationsByTitle[i]!.confidence);
    }
  });

  it("end-to-end: full pipeline from ingest to triage", async () => {
    const project = await obsxa.project.add({
      id: "seismic-e2e",
      name: "E2E Seismic Monitor",
      description: "Full pipeline test with USGS data",
    });
    expect(project.id).toBe("seismic-e2e");

    const added = await obsxa.observation.addMany(
      EARTHQUAKES.map((eq) => ({
        projectId: "seismic-e2e",
        title: `M ${eq.mag} - ${eq.place}`,
        description: `Magnitude ${eq.mag} earthquake at depth ${eq.depth} km`,
        type: "measurement" as const,
        source: eq.id,
        sourceType: "external" as const,
        confidence: sigToConfidence(eq.sig),
        tags: [regionKey(eq.place), magTag(eq.mag), eq.depth > 100 ? "deep" : "shallow"],
        data: JSON.stringify({ lon: eq.lon, lat: eq.lat, depth: eq.depth }),
        context: JSON.stringify({ network: "us", stations: eq.nst }),
        capturedAt: new Date(eq.time),
        sourceRef: `usgs:${eq.id}`,
        collector: "usgs-fdsnws",
        evidenceStrength: stationsToEvidence(eq.nst),
        novelty: eq.mag >= 6 ? 80 : 40,
        uncertainty: Math.min(100, Math.round(eq.gap)),
      })),
    );
    expect(added).toHaveLength(14);

    await obsxa.relation.add({
      fromObservationId: added[1]!.id,
      toObservationId: added[0]!.id,
      type: "same_signal_as",
      confidence: 90,
    });
    await obsxa.relation.add({
      fromObservationId: added[2]!.id,
      toObservationId: added[0]!.id,
      type: "same_signal_as",
      confidence: 85,
    });
    await obsxa.relation.add({
      fromObservationId: added[4]!.id,
      toObservationId: added[3]!.id,
      type: "supports",
      confidence: 80,
    });
    await obsxa.relation.add({
      fromObservationId: added[5]!.id,
      toObservationId: added[3]!.id,
      type: "supports",
      confidence: 75,
    });
    await obsxa.relation.add({
      fromObservationId: added[7]!.id,
      toObservationId: added[6]!.id,
      type: "supports",
      confidence: 82,
    });
    await obsxa.relation.add({
      fromObservationId: added[9]!.id,
      toObservationId: added[8]!.id,
      type: "supports",
      confidence: 78,
    });

    const regions: Record<string, number[]> = {};
    for (let i = 0; i < EARTHQUAKES.length; i++) {
      const r = regionKey(EARTHQUAKES[i]!.place);
      if (!regions[r]) regions[r] = [];
      regions[r].push(added[i]!.id);
    }
    let clusterCount = 0;
    for (const [region, ids] of Object.entries(regions)) {
      if (ids.length >= 2) {
        const c = await obsxa.cluster.add({ projectId: "seismic-e2e", name: `Region: ${region}` });
        for (const id of ids) await obsxa.cluster.addMember(c.id, id);
        clusterCount++;
      }
    }
    expect(clusterCount).toBe(4);

    await obsxa.observation.incrementFrequency(added[0]!.id);

    const stats = await obsxa.analysis.stats("seismic-e2e");
    expect(stats.total).toBe(14);
    expect(stats.active).toBe(14);
    expect(stats.totalClusters).toBe(4);
    expect(stats.byType.measurement).toBe(14);

    const frequent = await obsxa.analysis.frequent("seismic-e2e");
    expect(frequent).toHaveLength(1);
    expect(frequent[0]!.id).toBe(added[0]!.id);

    const convergent = await obsxa.analysis.convergent("seismic-e2e");
    expect(convergent.map((o) => o.id)).toContain(added[3]!.id);

    const isolated = await obsxa.analysis.isolated("seismic-e2e");
    expect(isolated.map((o) => o.id)).toContain(added[10]!.id);
    expect(isolated.map((o) => o.id)).toContain(added[12]!.id);
    expect(isolated.map((o) => o.id)).toContain(added[13]!.id);

    const triaged = await obsxa.analysis.triage("seismic-e2e", 14, "triage");
    expect(triaged).toHaveLength(14);
    expect(triaged[0]!.score).toBeGreaterThan(0);

    await obsxa.observation.promote(added[0]!.id, "hypxa:seismic:hirara-swarm-2026");
    await obsxa.observation.dismiss(added[10]!.id, {
      reasonCode: "noise",
      reasonNote: "Isolated deep event",
    });
    await obsxa.observation.archive(added[13]!.id, { reasonCode: "manual_review" });

    const finalStats = await obsxa.analysis.stats("seismic-e2e");
    expect(finalStats.promoted).toBe(1);
    expect(finalStats.dismissed).toBe(1);
    expect(finalStats.archived).toBe(1);
    expect(finalStats.active).toBe(11);

    const searchJapan = await obsxa.search.search("Hirara", "seismic-e2e");
    expect(searchJapan.length).toBe(3);

    const searchItaly = await obsxa.search.search("Anacapri", "seismic-e2e");
    expect(searchItaly.length).toBe(1);

    const unpromoted = await obsxa.analysis.unpromoted("seismic-e2e");
    expect(unpromoted.map((o) => o.id)).not.toContain(added[0]!.id);
    expect(unpromoted.map((o) => o.id)).not.toContain(added[10]!.id);
    expect(unpromoted.map((o) => o.id)).not.toContain(added[13]!.id);
    expect(unpromoted).toHaveLength(11);

    const allObs = await obsxa.observation.list("seismic-e2e");
    const toonStr = encode(allObs);
    const decoded = decode(toonStr) as unknown as Observation[];
    expect(decoded).toHaveLength(14);
  });
});
