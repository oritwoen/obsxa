import { afterEach, describe, expect, it, vi } from "vitest";
import { parseOptionalInt } from "../src/commands/observation.ts";

function withProcessExitStub(fn: () => void) {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit:${code ?? 0}`);
  });
  try {
    fn();
  } finally {
    exitSpy.mockRestore();
  }
}

describe("parseOptionalInt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined for missing value", () => {
    expect(parseOptionalInt(undefined, "confidence", { min: 0, max: 100 })).toBeUndefined();
  });

  it("accepts values inside range", () => {
    expect(parseOptionalInt("0", "confidence", { min: 0, max: 100 })).toBe(0);
    expect(parseOptionalInt("100", "confidence", { min: 0, max: 100 })).toBe(100);
  });

  it("exits for out-of-range values", () => {
    expect(() =>
      withProcessExitStub(() => {
        parseOptionalInt("101", "confidence", { min: 0, max: 100 });
      }),
    ).toThrow("process.exit:1");
  });

  it("exits for empty string", () => {
    expect(() =>
      withProcessExitStub(() => {
        parseOptionalInt("", "confidence", { min: 0, max: 100 });
      }),
    ).toThrow("process.exit:1");
  });

  it("exits for unsafe integers", () => {
    expect(() =>
      withProcessExitStub(() => {
        parseOptionalInt("9007199254740993", "confidence", { min: 0, max: 100 });
      }),
    ).toThrow("process.exit:1");
  });
});
