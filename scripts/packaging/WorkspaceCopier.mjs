import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const excludedTopLevelDirectories = new Set([
  ".codex-logs",
  ".git",
  "dist",
  "node_modules",
  "release",
]);

class WorkspaceCopier {
  static #instance;

  static get instance() {
    if (this.#instance == null) {
      this.#instance = new WorkspaceCopier();
    }

    return this.#instance;
  }

  copySourceTree(sourceRoot) {
    const stagingRoot = mkdtempSync(path.join(os.tmpdir(), "unifyr-mastercrafter-linux-"));

    cpSync(sourceRoot, stagingRoot, {
      dereference: false,
      filter: (sourcePath) => this.#shouldCopy(sourceRoot, sourcePath),
      force: true,
      recursive: true,
    });

    return stagingRoot;
  }

  mergeArtifacts(sourceDirectory, targetDirectory) {
    if (!existsSync(sourceDirectory)) {
      throw new Error(`Expected build output directory is missing: ${sourceDirectory}`);
    }

    mkdirSync(targetDirectory, { recursive: true });
    cpSync(sourceDirectory, targetDirectory, {
      dereference: false,
      force: true,
      recursive: true,
    });
  }

  cleanup(directory) {
    rmSync(directory, {
      force: true,
      recursive: true,
    });
  }

  toWslPath(windowsPath) {
    const normalized = path.win32.resolve(windowsPath);
    const parsed = path.win32.parse(normalized);

    if (parsed.root == null || parsed.root.length < 2 || parsed.root[1] !== ":") {
      throw new Error(`Expected a Windows drive path, received: ${windowsPath}`);
    }

    const driveLetter = parsed.root[0].toLowerCase();
    const remainder = normalized.slice(parsed.root.length).replace(/\\/g, "/");

    if (remainder.length === 0) {
      return `/mnt/${driveLetter}`;
    }

    return `/mnt/${driveLetter}/${remainder}`;
  }

  #shouldCopy(sourceRoot, sourcePath) {
    const relativePath = path.relative(sourceRoot, sourcePath);

    if (relativePath.length === 0) {
      return true;
    }

    const [topLevelDirectory] = relativePath.split(path.sep);
    return !excludedTopLevelDirectories.has(topLevelDirectory);
  }
}

export { WorkspaceCopier };
