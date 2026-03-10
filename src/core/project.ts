import { eq } from 'drizzle-orm'
import { projects } from './db.ts'
import type { ObsxaDB } from './db.ts'
import type { CreateProject, Project } from '../types.ts'

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  }
}

export function createProjectStore(db: ObsxaDB) {
  return {
    add(input: CreateProject): Project {
      const row = db.insert(projects).values({
        id: input.id,
        name: input.name,
        description: input.description,
      }).returning().get()

      return toProject(row)
    },

    get(id: string): Project | null {
      const row = db.select().from(projects).where(eq(projects.id, id)).get()
      return row ? toProject(row) : null
    },

    list(): Project[] {
      return db.select().from(projects).all().map(toProject)
    },

    remove(id: string): void {
      db.delete(projects).where(eq(projects.id, id)).run()
    },
  }
}
