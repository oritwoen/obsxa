# obsxa

[![npm version](https://img.shields.io/npm/v/obsxa?style=flat&colorA=130f40&colorB=474787)](https://npmjs.com/package/obsxa)
[![npm downloads](https://img.shields.io/npm/dm/obsxa?style=flat&colorA=130f40&colorB=474787)](https://npm.chart.dev/obsxa)
[![license](https://img.shields.io/github/license/oritwoen/obsxa?style=flat&colorA=130f40&colorB=474787)](https://github.com/oritwoen/obsxa/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/oritwoen/obsxa)

> Structured observation management for research agents — the pre-hypothesis stage.

## Why?

Research agents notice things constantly — patterns in data, anomalies in outputs, correlations across experiments — but these raw observations vanish between sessions. Without structure, the same thing gets "discovered" repeatedly, related observations never get connected, and the step from "I noticed X" to "I hypothesize Y" stays implicit.

obsxa makes observation tracking mechanical. Each observation records what was noticed, where it came from, how confident the observation is, and how many times it's been seen. Relations connect observations (similar, contradicting, supporting, derived). Clusters group related observations. Frequency tracking catches recurring patterns. Promotion links observations to hypotheses when they mature. Analysis surfaces unpromoted candidates, isolated observations, and convergent signals from multiple sources.

## Features

- 👁️ **Typed observations** - pattern, anomaly, measurement, correlation, artifact
- 📡 **Source tracking** - where each observation came from (experiment, scan, manual, computation, external)
- 🔢 **Frequency counting** - how many times something was observed
- 🔗 **Observation relations** - similar_to, contradicts, supports, derived_from
- 🧩 **Dedup workflow** - exact fingerprint, trigram similarity, sourceRef matching, review and merge
- 🧬 **Richer relations** - duplicate_of, refines, same_signal_as with confidence
- 📦 **Clusters** - group related observations together
- 🎯 **Promotion** - observation → hypothesis pipeline with reference tracking
- 📋 **Unpromoted detection** - surfaces observations that haven't led to hypotheses yet
- 🧪 **Observation quality** - evidence strength, novelty, uncertainty, reproducibility hint
- 🔬 **Observation context** - structured conditions/environment metadata per observation
- 🧭 **Triage ranking** - prioritize active observations for review
- 🧾 **Status transition audit** - track why states changed
- 📝 **Edit history** - field-level change log for every observation update
- 📦 **Batch ergonomics** - import/export and batch updates for agent pipelines
- 🔄 **Lifecycle management** - active → promoted/dismissed/archived
- 🔎 **FTS5 search** - full-text search across titles, descriptions, and tags
- ⌨️ **CLI with `--json` and `--toon`** - 9 subcommands, designed as the primary agent interface
- 🎒 **[TOON](https://github.com/toon-format/toon) output** - token-efficient format for LLM context windows
- 🪶 **ESM-only** - built with [obuild](https://github.com/unjs/obuild)

## Install

```bash
pnpm add obsxa
```

For the AI SDK tools (`obsxa/ai` subpath), also install `ai` and `zod`:

```bash
pnpm add ai zod
```

## Quick start

### API

```ts
import { createObsxa } from "obsxa";

const obsxa = await createObsxa({ db: "./research.db" });

// Create a project
await obsxa.project.add({ id: "sensor-data", name: "Sensor Analysis" });

// Record observations
const o1 = await obsxa.observation.add({
  projectId: "sensor-data",
  title: "Temperature spike at station 7",
  description: "Unusual 3σ deviation from baseline",
  type: "anomaly",
  source: "station-7",
  sourceType: "scan",
  confidence: 75,
  tags: ["temperature", "outlier"],
  context: JSON.stringify({ instrument: "DHT22", location: "lab-3", ambient: 21.0 }),
});

const o2 = await obsxa.observation.add({
  projectId: "sensor-data",
  title: "Humidity drop correlates with spike",
  source: "station-7-humidity",
  sourceType: "experiment",
  confidence: 90,
});

// Seen again — increment frequency
await obsxa.observation.incrementFrequency(o1.id);

// Connect related observations
await obsxa.relation.add({
  fromObservationId: o2.id,
  toObservationId: o1.id,
  type: "supports",
});

// Group them
const cluster = await obsxa.cluster.add({
  projectId: "sensor-data",
  name: "Station 7 anomalies",
});
await obsxa.cluster.addMember(cluster.id, o1.id);
await obsxa.cluster.addMember(cluster.id, o2.id);

// Promote to hypothesis when ready
await obsxa.observation.promote(o1.id, "hypxa:sensor-data:1");

// Analysis
const frequent = await obsxa.analysis.frequent("sensor-data"); // observations seen multiple times
const unpromoted = await obsxa.analysis.unpromoted("sensor-data"); // candidates for hypotheses
const isolated = await obsxa.analysis.isolated("sensor-data"); // observations with no relations
const convergent = await obsxa.analysis.convergent("sensor-data"); // confirmed by multiple sources
const stats = await obsxa.analysis.stats("sensor-data"); // project-level summary

await obsxa.close();
```

### CLI

```bash
# Project management
obsxa backup create --db ./obsxa.db
obsxa backup restore --db ./obsxa.db --from ./obsxa.db.bak.2026-03-10T11-00-00-000Z
obsxa project add --id sensor-data --name "Sensor Analysis"
obsxa project list

# Observation lifecycle
obsxa observation add --project sensor-data --title "Temperature spike at station 7" \
  --type anomaly --source "station-7" --source-type scan --confidence 75 \
  --tags "temperature,outlier"
obsxa observation add --project sensor-data --title "Temperature spike at station 7" \
  --source "station-7" --evidence 82 --novelty 70 --uncertainty 25 \
  --collector "agent:alpha" --source-ref "scan:run-42"
obsxa observation get 1
obsxa observation list --project sensor-data --status active --type anomaly
obsxa observation update 1 --confidence 85
obsxa observation bump 1          # increment frequency
obsxa observation dismiss 3 --reason noise
obsxa observation transitions 3
obsxa observation edits 1
obsxa observation archive 8 --reason manual_review --note "Superseded"
obsxa triage sensor-data

# Batch operations
obsxa observation export --project sensor-data > observations.json
obsxa observation export --project sensor-data --toon > observations.toon
obsxa observation import --file observations.json
obsxa observation import --file observations.toon
obsxa observation batch-update --file updates.json

# Promote to hypothesis
obsxa promote 1 --ref "hypxa:sensor-data:1"

# Relations
obsxa relation add --from 2 --to 1 --type supports
obsxa relation add --from 7 --to 3 --type same_signal_as --confidence 84 --notes "Same source family"
obsxa relation list --observation 1

# Dedup
obsxa dedup scan --project sensor-data
obsxa dedup candidates --project sensor-data --status open
obsxa dedup review --id 4 --status dismissed --reason "False positive"
obsxa dedup merge --primary 1 --duplicate 12 --strategy average

# Clusters
obsxa cluster add --project sensor-data --name "Station 7 anomalies"
obsxa cluster member --cluster 1 --observation 1
obsxa cluster members --cluster 1
obsxa cluster list --project sensor-data

# Analysis
obsxa status sensor-data
obsxa frequent sensor-data
obsxa unpromoted sensor-data

# Search
obsxa search "temperature spike" --project sensor-data

# Machine-readable output for agents
obsxa observation list --project sensor-data --json
obsxa observation list --project sensor-data --toon
```

Add `--json` to any command for machine-readable output, or `--toon` for [TOON](https://github.com/toon-format/toon) format (compact, token-efficient, ideal for LLM context).

### AI SDK tools

`obsxa/ai` exports 7 ready-made tools for [AI SDK](https://ai-sdk.dev/) apps:

```ts
import { generateText } from "ai";
import {
  observationTool,
  relationTool,
  clusterTool,
  dedupTool,
  searchTool,
  analysisTool,
  promoteTool,
} from "obsxa/ai";

const { text } = await generateText({
  model: yourModel,
  tools: {
    observation: observationTool,
    relation: relationTool,
    cluster: clusterTool,
    dedup: dedupTool,
    search: searchTool,
    analysis: analysisTool,
    promote: promoteTool,
  },
  prompt: "Record an observation: temperature sensor at station 7 shows unusual 3σ deviation.",
});
```

Each tool uses `discriminatedUnion` on an `operation` field for multiple operations through a single tool.

## CLI reference

| Command                              | Description                                         |
| ------------------------------------ | --------------------------------------------------- |
| `obsxa project add`                  | Create a new project                                |
| `obsxa project list`                 | List all projects                                   |
| `obsxa backup create`                | Create backup of db/wal/shm files                   |
| `obsxa backup restore`               | Restore db/wal/shm from backup base path            |
| `obsxa observation add`              | Record a new observation                            |
| `obsxa observation get <id>`         | Get observation details                             |
| `obsxa observation list`             | List observations (filter by project, status, type) |
| `obsxa observation update <id>`      | Update title, description, confidence, tags, etc.   |
| `obsxa observation bump <id>`        | Increment frequency counter                         |
| `obsxa observation edits <id>`       | List field-level edit history                       |
| `obsxa observation dismiss <id>`     | Dismiss as noise/irrelevant                         |
| `obsxa observation archive <id>`     | Archive active observation with reason              |
| `obsxa observation transitions <id>` | List status transition history                      |
| `obsxa observation import`           | Import observations from JSON or TOON file          |
| `obsxa observation export`           | Export project observations as JSON or TOON         |
| `obsxa observation batch-update`     | Apply multiple updates from JSON array file         |
| `obsxa promote <id>`                 | Promote to hypothesis with reference                |
| `obsxa relation add`                 | Add a relation between observations                 |
| `obsxa relation list`                | List relations for an observation                   |
| `obsxa dedup scan`                   | Scan for duplicate observation candidates           |
| `obsxa dedup candidates`             | List duplicate candidates by status                 |
| `obsxa dedup review`                 | Review a duplicate candidate decision               |
| `obsxa dedup merge`                  | Merge a duplicate into a primary observation        |
| `obsxa cluster add`                  | Create an observation cluster                       |
| `obsxa cluster list`                 | List clusters in a project                          |
| `obsxa cluster member`               | Add observation to cluster                          |
| `obsxa cluster members`              | List observations in a cluster                      |
| `obsxa search <query>`               | Full-text search across observations                |
| `obsxa status <project>`             | Project stats dashboard                             |
| `obsxa triage <project>`             | Rank active observations by triage score            |
| `obsxa frequent <project>`           | Observations seen multiple times                    |
| `obsxa unpromoted <project>`         | Active observations not yet promoted                |

## Observation types

| Type          | Use case                                               |
| ------------- | ------------------------------------------------------ |
| `pattern`     | Recurring structure or regularity in data              |
| `anomaly`     | Unexpected deviation from expected behavior            |
| `measurement` | Quantitative data point or reading                     |
| `correlation` | Relationship noticed between variables                 |
| `artifact`    | Physical/digital artifact found (image, file, QR code) |

## Source types

| Source type   | Description                                  |
| ------------- | -------------------------------------------- |
| `experiment`  | Result from a formal experiment              |
| `manual`      | Human observation or manual inspection       |
| `scan`        | Automated scan or sweep                      |
| `computation` | Automated computation or analysis            |
| `external`    | External data source (blockchain, API, etc.) |

## Observation lifecycle

```
active → promoted    (became a hypothesis)
       → dismissed   (determined to be noise)
       → archived    (kept for reference)
```

- **active** - default state, observation is current and relevant
- **promoted** - observation matured into a hypothesis (tracked via `promotedTo` field)
- **dismissed** - observation determined to be noise or irrelevant
- **archived** - no longer active but kept for historical reference

## Observation relations

| Type             | Meaning                                    |
| ---------------- | ------------------------------------------ |
| `similar_to`     | Two observations appear related            |
| `contradicts`    | Two observations are incompatible          |
| `supports`       | One observation strengthens another        |
| `derived_from`   | One observation was derived from another   |
| `duplicate_of`   | Observation is a duplicate of another      |
| `refines`        | Observation refines granularity of another |
| `same_signal_as` | Same underlying signal from another source |

Self-referencing relations are prevented. Duplicate relations return the existing relation.

## Analysis functions

| Function     | Returns                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `stats`      | Project dashboard: counts by status/type, avg confidence, cluster count |
| `frequent`   | Observations with `frequency > 1`, sorted descending                    |
| `isolated`   | Observations with zero relations                                        |
| `convergent` | Observations with 2+ supporting relations from different sources        |
| `promoted`   | Observations that became hypotheses                                     |
| `unpromoted` | Active observations without promotion — candidates for hypotheses       |

## Data model

```ts
interface Observation {
  id: number;
  projectId: string;
  title: string;
  description: string | null;
  type: "pattern" | "anomaly" | "measurement" | "correlation" | "artifact";
  source: string;
  sourceType: "experiment" | "manual" | "scan" | "computation" | "external";
  confidence: number;
  frequency: number;
  status: "active" | "promoted" | "dismissed" | "archived";
  promotedTo: string | null;
  tags: string[];
  data: string | null;
  context: string | null;
  capturedAt: Date | null;
  sourceRef: string | null;
  collector: string | null;
  inputHash: string | null;
  evidenceStrength: number;
  novelty: number;
  uncertainty: number;
  reproducibilityHint: string | null;
  triageScore: number;
  dismissedReasonCode: string | null;
  archivedReasonCode: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

interface ObservationEdit {
  id: number;
  observationId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: Date;
}

interface ObservationRelation {
  id: number;
  fromObservationId: number;
  toObservationId: number;
  type:
    | "similar_to"
    | "contradicts"
    | "supports"
    | "derived_from"
    | "duplicate_of"
    | "refines"
    | "same_signal_as";
  confidence: number;
  notes: string | null;
  createdAt: Date;
}

interface Cluster {
  id: number;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

interface ProjectStats {
  total: number;
  active: number;
  promoted: number;
  dismissed: number;
  archived: number;
  avgConfidence: number;
  totalClusters: number;
  byType: {
    pattern: number;
    anomaly: number;
    measurement: number;
    correlation: number;
    artifact: number;
  };
}
```

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm build       # obuild
pnpm test        # vitest (watch mode)
pnpm test:run    # vitest --run
```

## Data Safety Across Releases

- Schema changes are forward-only through Drizzle migrations in `drizzle/`
- On startup, obsxa validates `schema_version` in `obsxa_meta`
- If database schema is older, obsxa migrates automatically (default `autoMigrate: true`)
- Before migration, obsxa creates a database backup by default (`autoBackup: true`)
- You can also create/restore manual backups with `obsxa backup create` and `obsxa backup restore`
- If database schema is newer than the runtime, startup fails fast with a clear error

You can configure startup behavior:

```ts
const obsxa = await createObsxa({
  db: "./obsxa.db",
  autoMigrate: true, // default
  autoBackup: true, // default
  backupDir: "./backups",
});
await obsxa.close();
```

## License

[MIT](./LICENSE)
