import { and, eq } from "drizzle-orm";
import { clusterMembers, clusters, observations, projects } from "./db.ts";
import type { ObsxaDB } from "./db.ts";
import { toObservation } from "./mappers.ts";
import type { AddCluster, Cluster, ClusterMember, Observation } from "../types.ts";

function toCluster(row: typeof clusters.$inferSelect): Cluster {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  };
}

function toClusterMember(row: typeof clusterMembers.$inferSelect): ClusterMember {
  return {
    id: row.id,
    clusterId: row.clusterId,
    observationId: row.observationId,
    createdAt: row.createdAt,
  };
}

export function createClusterStore(db: ObsxaDB) {
  return {
    async add(input: AddCluster): Promise<Cluster> {
      const project = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .get();
      if (!project) throw new Error(`Project "${input.projectId}" not found`);

      const row = await db
        .insert(clusters)
        .values({
          projectId: input.projectId,
          name: input.name,
          description: input.description,
        })
        .returning()
        .get();

      return toCluster(row);
    },

    async list(projectId: string): Promise<Cluster[]> {
      return (await db.select().from(clusters).where(eq(clusters.projectId, projectId)).all()).map(
        toCluster,
      );
    },

    async get(id: number): Promise<Cluster | null> {
      const row = await db.select().from(clusters).where(eq(clusters.id, id)).get();
      return row ? toCluster(row) : null;
    },

    async addMember(clusterId: number, observationId: number): Promise<ClusterMember> {
      const cluster = await db
        .select({ id: clusters.id, projectId: clusters.projectId })
        .from(clusters)
        .where(eq(clusters.id, clusterId))
        .get();
      if (!cluster) throw new Error(`Cluster #${clusterId} not found`);

      const observation = await db
        .select({ id: observations.id, projectId: observations.projectId })
        .from(observations)
        .where(eq(observations.id, observationId))
        .get();
      if (!observation) throw new Error(`Observation #${observationId} not found`);

      if (cluster.projectId !== observation.projectId) {
        throw new Error(
          `Cannot add observation from project "${observation.projectId}" to cluster in project "${cluster.projectId}"`,
        );
      }

      const existing = await db
        .select()
        .from(clusterMembers)
        .where(
          and(
            eq(clusterMembers.clusterId, clusterId),
            eq(clusterMembers.observationId, observationId),
          ),
        )
        .get();
      if (existing) return toClusterMember(existing);

      const row = await db
        .insert(clusterMembers)
        .values({ clusterId, observationId })
        .returning()
        .get();
      return toClusterMember(row);
    },

    async listMembers(clusterId: number): Promise<Observation[]> {
      const rows = await db
        .select({ observation: observations })
        .from(clusterMembers)
        .innerJoin(observations, eq(clusterMembers.observationId, observations.id))
        .where(eq(clusterMembers.clusterId, clusterId))
        .all();

      return rows.map((row) => toObservation(row.observation));
    },

    async removeMember(memberId: number): Promise<void> {
      await db.delete(clusterMembers).where(eq(clusterMembers.id, memberId)).run();
    },
  };
}
