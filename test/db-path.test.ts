import { describe, expect, it } from "vitest";
import { getDefaultDbPath } from "../src/core/db-path.ts";

describe("getDefaultDbPath", () => {
  it("uses XDG_DATA_HOME when present", () => {
    const path = getDefaultDbPath(
      { XDG_DATA_HOME: "/tmp/xdg-data" } as NodeJS.ProcessEnv,
      "/home/test",
      "linux",
    );
    expect(path).toBe("/tmp/xdg-data/obsxa/obsxa.db");
  });

  it("falls back to HOME/.local/share when XDG_DATA_HOME is missing", () => {
    const path = getDefaultDbPath({} as NodeJS.ProcessEnv, "/home/test", "linux");
    expect(path).toBe("/home/test/.local/share/obsxa/obsxa.db");
  });

  it("treats blank XDG_DATA_HOME as missing", () => {
    const path = getDefaultDbPath(
      { XDG_DATA_HOME: "   " } as NodeJS.ProcessEnv,
      "/home/test",
      "linux",
    );
    expect(path).toBe("/home/test/.local/share/obsxa/obsxa.db");
  });

  it("uses macOS Application Support fallback", () => {
    const path = getDefaultDbPath({} as NodeJS.ProcessEnv, "/Users/test", "darwin");
    expect(path).toBe("/Users/test/Library/Application Support/obsxa/obsxa.db");
  });

  it("uses LOCALAPPDATA on Windows", () => {
    const path = getDefaultDbPath(
      { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" } as NodeJS.ProcessEnv,
      "C:\\Users\\test",
      "win32",
    );
    expect(path).toBe("C:\\Users\\test\\AppData\\Local\\obsxa\\obsxa.db");
  });

  it("falls back to AppData Local on Windows when LOCALAPPDATA is missing", () => {
    const path = getDefaultDbPath({} as NodeJS.ProcessEnv, "C:\\Users\\test", "win32");
    expect(path).toBe("C:\\Users\\test\\AppData\\Local\\obsxa\\obsxa.db");
  });

  it("uses XDG_DATA_HOME on Windows when present", () => {
    const path = getDefaultDbPath(
      {
        XDG_DATA_HOME: "D:\\xdg-data",
        LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
      } as NodeJS.ProcessEnv,
      "C:\\Users\\test",
      "win32",
    );
    expect(path).toBe("D:\\xdg-data\\obsxa\\obsxa.db");
  });

  it("throws when home directory is empty", () => {
    expect(() => getDefaultDbPath({} as NodeJS.ProcessEnv, "", "linux")).toThrow(
      "Home directory must not be empty",
    );
  });
});
