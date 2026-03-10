import { and, eq } from 'drizzle-orm'
import { clusterMembers, clusters, observations, projects } from './db.ts'
import type { ObsxaDB } from './db.ts'
import { toObservation } from './mappers.ts'
import type { AddCluster, Cluster, ClusterMember, Observation } from '../types.ts'

function toCluster(row: typeof clusters.$inferSelect): Cluster {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  }
}

function toClusterMember(row: typeof clusterMembers.$inferSelect): ClusterMember {
  return {
    id: row.id,
    clusterId: row.clusterId,
    observationId: row.observationId,
    createdAt: row.createdAt,
  }
}

export function createClusterStore(db: ObsxaDB) {
  return {
    add(input: AddCluster): Cluster {
      const project = db.select({ id: projects.id }).from(projects)
        .where(eq(projects.id, input.projectId))
        .get()
      if (!project) throw new Error(`Project "${input.projectId}" not found`)

      const row = db.insert(clusters).values({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
      }).returning().get()

      return toCluster(row)
    },

    list(projectId: string): Cluster[] {
      return db.select().from(clusters).where(eq(clusters.projectId, projectId)).all().map(toCluster)
    },

    get(id: number): Cluster | null {
      const row = db.select().from(clusters).where(eq(clusters.id, id)).get()
      return row ? toCluster(row) : null
    },

    addMember(clusterId: number, observationId: number): ClusterMember {
      const cluster = db.select({ id: clusters.id }).from(clusters).where(eq(clusters.id, clusterId)).get()
      if (!cluster) throw new Error(`Cluster #${clusterId} not found`)

      const observation = db.select({ id: observations.id }).from(observations)
        .where(eq(observations.id, observationId))
        .get()
      if (!observation) throw new Error(`Observation #${observationId} not found`)

      const existing = db.select().from(clusterMembers).where(and(
        eq(clusterMembers.clusterId, clusterId),
        eq(clusterMembers.observationId, observationId),
      )).get()
      if (existing) return toClusterMember(existing)

      const row = db.insert(clusterMembers).values({ clusterId, observationId }).returning().get()
      return toClusterMember(row)
    },

    listMembers(clusterId: number): Observation[] {
      const rows = db.select({ observation: observations }).from(clusterMembers)
        .innerJoin(observations, eq(clusterMembers.observationId, observations.id))
        .where(eq(clusterMembers.clusterId, clusterId))
        .all()

      return rows.map(row => toObservation(row.observation))
    },

    removeMember(memberId: number): void {
      db.delete(clusterMembers).where(eq(clusterMembers.id, memberId)).run()
    },
  }
}
