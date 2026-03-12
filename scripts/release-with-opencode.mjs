import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(rootDir, "package.json");
const opencodePackageJsonPath = resolve(rootDir, "opencode/package.json");

function run(cmd, args) {
  execFileSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

function readRootVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("Missing version in package.json");
  }
  return version;
}

function syncOpencodePackageVersion(version) {
  if (!existsSync(opencodePackageJsonPath)) {
    throw new Error(`Missing wrapper package definition at ${opencodePackageJsonPath}`);
  }

  const opencodePackageJson = JSON.parse(readFileSync(opencodePackageJsonPath, "utf8"));
  opencodePackageJson.version = version;
  opencodePackageJson.dependencies ??= {};
  opencodePackageJson.dependencies.obsxa = version;
  writeFileSync(
    opencodePackageJsonPath,
    `${JSON.stringify(opencodePackageJson, null, 2)}\n`,
    "utf8",
  );
}

run("changelogen", ["--bump"]);

const version = readRootVersion();
syncOpencodePackageVersion(version);

run("git", ["add", "."]);
run("git", ["commit", "-m", `v${version}`]);
run("git", ["tag", `v${version}`]);
run("git", ["push", "--follow-tags"]);
