import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { formatDisplayVersion } from "./versioning.mjs";

function readPackageVersion(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`Invalid package version in ${packageJsonPath}`);
  }

  return packageJson.version;
}

const version = readPackageVersion(process.cwd());
const displayVersion = formatDisplayVersion(version);
const metadata = { version, displayVersion };

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ndisplayVersion=${displayVersion}\n`);
} else {
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}
