import { eq } from "drizzle-orm";
import { projects } from "./db.ts";
import type { ObsxaDB } from "./db.ts";
import type { CreateProject, Project } from "../types.ts";

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  };
}

export function createProjectStore(db: ObsxaDB) {
  return {
    async add(input: CreateProject): Promise<Project> {
      const row = await db
        .insert(projects)
        .values({
          id: input.id,
          name: input.name,
          description: input.description,
        })
        .returning()
        .get();

      return toProject(row);
    },

    async get(id: string): Promise<Project | null> {
      const row = await db.select().from(projects).where(eq(projects.id, id)).get();
      return row ? toProject(row) : null;
    },

    async list(): Promise<Project[]> {
      return (await db.select().from(projects).all()).map(toProject);
    },

    async remove(id: string): Promise<void> {
      await db.delete(projects).where(eq(projects.id, id)).run();
    },
  };
}
