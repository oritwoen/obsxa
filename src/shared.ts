import { createHash } from "node:crypto";

export function computeInputHash(payload: string, collector: string, projectId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ payload, collector, projectId }))
    .digest("hex");
}

export function isSqliteConstraintError(error: unknown): boolean {
  let current: unknown = error;
  while (current) {
    const obj = current as {
      message?: unknown;
      code?: unknown;
      rawCode?: unknown;
      extendedCode?: unknown;
      cause?: unknown;
    };
    const message = typeof obj.message === "string" ? obj.message : String(obj.message ?? "");
    const code = typeof obj.code === "string" ? obj.code : String(obj.code ?? "");
    const rawCode = String(obj.rawCode ?? "");
    const extendedCode =
      typeof obj.extendedCode === "string" ? obj.extendedCode : String(obj.extendedCode ?? "");
    if (
      message.includes("UNIQUE constraint") ||
      message.includes("SQLITE_CONSTRAINT") ||
      code.includes("SQLITE_CONSTRAINT") ||
      extendedCode.includes("SQLITE_CONSTRAINT") ||
      rawCode === "1555"
    ) {
      return true;
    }
    current = obj.cause;
  }
  return false;
}
