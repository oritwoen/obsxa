import { defineConfig } from "drizzle-kit";

export default defineConfig({ schema: "./src/core/db.ts", out: "./drizzle", dialect: "sqlite" });
