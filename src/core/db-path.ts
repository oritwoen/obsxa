import { homedir } from "node:os";
import { join, win32 } from "node:path";

export function getDefaultDbPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (!home || home.trim().length === 0) {
    throw new Error("Home directory must not be empty");
  }

  const xdgDataHome = env.XDG_DATA_HOME?.trim();
  const fallbackDataHome =
    platform === "win32"
      ? env.LOCALAPPDATA?.trim() || win32.join(home, "AppData", "Local")
      : platform === "darwin"
        ? join(home, "Library", "Application Support")
        : join(home, ".local", "share");

  const dataHome = xdgDataHome && xdgDataHome.length > 0 ? xdgDataHome : fallbackDataHome;
  return platform === "win32"
    ? win32.join(dataHome, "obsxa", "obsxa.db")
    : join(dataHome, "obsxa", "obsxa.db");
}
