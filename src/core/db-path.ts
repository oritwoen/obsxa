import { homedir } from "node:os";
import { posix, win32 } from "node:path";

export function getDefaultDbPath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const xdgDataHome = env.XDG_DATA_HOME?.trim();
  const localAppData = env.LOCALAPPDATA?.trim();

  if (xdgDataHome && xdgDataHome.length > 0) {
    return platform === "win32"
      ? win32.join(xdgDataHome, "obsxa", "obsxa.db")
      : posix.join(xdgDataHome, "obsxa", "obsxa.db");
  }

  if (platform === "win32") {
    if (localAppData && localAppData.length > 0) {
      return win32.join(localAppData, "obsxa", "obsxa.db");
    }
    if (!home || home.trim().length === 0) {
      throw new Error("Home directory must not be empty");
    }
    return win32.join(home, "AppData", "Local", "obsxa", "obsxa.db");
  }

  if (!home || home.trim().length === 0) {
    throw new Error("Home directory must not be empty");
  }

  const fallbackDataHome =
    platform === "darwin"
      ? posix.join(home, "Library", "Application Support")
      : posix.join(home, ".local", "share");

  return posix.join(fallbackDataHome, "obsxa", "obsxa.db");
}
