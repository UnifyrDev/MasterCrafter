import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { CommandExecutor } from "./CommandExecutor.mjs";
import { WorkspaceCopier } from "./WorkspaceCopier.mjs";
import { formatDisplayVersion } from "./versioning.mjs";

const linuxTargetsByMode = new Map([
  ["all", ["deb", "rpm"]],
  ["linux", ["deb", "rpm"]],
  ["linux:deb", ["deb"]],
  ["linux:rpm", ["rpm"]],
]);

class PackagingOrchestrator {
  static #instance;

  static get instance() {
    if (this.#instance == null) {
      this.#instance = new PackagingOrchestrator();
    }

    return this.#instance;
  }

  constructor() {
    this.commandExecutor = CommandExecutor.instance;
    this.sourceRoot = process.cwd();
    this.packageVersion = this.#resolvePackageVersion();
    this.workspaceCopier = WorkspaceCopier.instance;
    this.wslDistro = "Ubuntu-22.04";
  }

  async run(argumentsList) {
    const plan = this.#createPlan(argumentsList);

    if (plan.linuxTargets.length > 0) {
      await this.#buildLinuxArtifacts(plan.linuxTargets);
    }

    if (plan.buildWindows) {
      await this.#buildWindowsArtifacts();
    }
  }

  #createPlan(argumentsList) {
    const [mode = "all", ...rest] = argumentsList;

    if (mode === "win") {
      return {
        buildWindows: true,
        linuxTargets: [],
      };
    }

    if (mode === "linux") {
      return {
        buildWindows: false,
        linuxTargets: this.#normalizeLinuxTargets(rest),
      };
    }

    if (linuxTargetsByMode.has(mode)) {
      return {
        buildWindows: mode === "all",
        linuxTargets: this.#normalizeLinuxTargets(linuxTargetsByMode.get(mode) ?? []),
      };
    }

    throw new Error(`Unknown packaging mode: ${mode}. Expected all, win, or linux.`);
  }

  #normalizeLinuxTargets(targets) {
    const requestedTargets = targets.length > 0 ? targets : ["deb", "rpm"];
    const uniqueTargets = [...new Set(requestedTargets)];
    const allowedTargets = new Set(["deb", "rpm"]);

    for (const target of uniqueTargets) {
      if (!allowedTargets.has(target)) {
        throw new Error(`Unsupported Linux packaging target: ${target}. Expected deb or rpm.`);
      }
    }

    return uniqueTargets;
  }

  async #buildWindowsArtifacts() {
    if (process.platform !== "win32") {
      throw new Error("Windows packaging can only run on Windows.");
    }

    const electronViteCli = path.resolve(this.sourceRoot, "node_modules/electron-vite/bin/electron-vite.js");
    const electronBuilderCli = path.resolve(this.sourceRoot, "node_modules/electron-builder/cli.js");

    this.commandExecutor.run(process.execPath, [electronViteCli, "build"], {
      cwd: this.sourceRoot,
    });

    this.commandExecutor.run(process.execPath, [electronBuilderCli, "--win", "nsis", "--publish", "never"], {
      cwd: this.sourceRoot,
    });

    this.#normalizeWindowsInstallerName();
  }

  #normalizeWindowsInstallerName() {
    const releaseDirectory = path.join(this.sourceRoot, "release");
    const sourceVersion = this.packageVersion;
    const displayVersion = formatDisplayVersion(sourceVersion);
    const sourceInstallerName = `MasterCrafter Setup ${sourceVersion}.exe`;
    const targetInstallerName = `MasterCrafter Setup ${displayVersion}.exe`;
    const sourceInstallerPath = path.join(releaseDirectory, sourceInstallerName);
    const targetInstallerPath = path.join(releaseDirectory, targetInstallerName);

    if (sourceInstallerPath !== targetInstallerPath && existsSync(sourceInstallerPath)) {
      rmSync(targetInstallerPath, { force: true });
      renameSync(sourceInstallerPath, targetInstallerPath);
    }

    const sourceBlockMapPath = path.join(releaseDirectory, `${sourceInstallerName}.blockmap`);
    const targetBlockMapPath = path.join(releaseDirectory, `${targetInstallerName}.blockmap`);

    if (sourceBlockMapPath !== targetBlockMapPath && existsSync(sourceBlockMapPath)) {
      rmSync(targetBlockMapPath, { force: true });
      renameSync(sourceBlockMapPath, targetBlockMapPath);
    }
  }

  async #buildLinuxArtifacts(targets) {
    if (targets.length === 0) {
      return;
    }

    if (process.platform !== "win32") {
      const electronViteCli = path.resolve(this.sourceRoot, "node_modules/electron-vite/bin/electron-vite.js");
      const electronBuilderCli = path.resolve(this.sourceRoot, "node_modules/electron-builder/cli.js");

      this.commandExecutor.run(process.execPath, [electronViteCli, "build"], {
        cwd: this.sourceRoot,
      });

      this.commandExecutor.run(process.execPath, [electronBuilderCli, "--linux", ...targets, "--publish", "never"], {
        cwd: this.sourceRoot,
      });

      this.#normalizeLinuxArtifactNames(targets);
      return;
    }

    const stagingRoot = this.workspaceCopier.copySourceTree(this.sourceRoot);

    try {
      const stagingWslPath = this.workspaceCopier.toWslPath(stagingRoot);
      const electronViteCli = path.posix.join("node_modules", "electron-vite", "bin", "electron-vite.js");
      const electronBuilderCli = path.posix.join("node_modules", "electron-builder", "cli.js");

      this.commandExecutor.run("wsl.exe", [
        "-d",
        this.wslDistro,
        "--cd",
        stagingWslPath,
        "--",
        "npm",
        "ci",
      ]);

      this.commandExecutor.run("wsl.exe", [
        "-d",
        this.wslDistro,
        "--cd",
        stagingWslPath,
        "--",
        "node",
        electronViteCli,
        "build",
      ]);

      this.commandExecutor.run("wsl.exe", [
        "-d",
        this.wslDistro,
        "--cd",
        stagingWslPath,
        "--",
        "node",
        electronBuilderCli,
        "--linux",
        ...targets,
        "--publish",
        "never",
      ]);

      const stagingReleaseDirectory = path.join(stagingRoot, "release");
      const sourceReleaseDirectory = path.join(this.sourceRoot, "release");
      this.workspaceCopier.mergeArtifacts(stagingReleaseDirectory, sourceReleaseDirectory);
      this.#normalizeLinuxArtifactNames(targets);
    } finally {
      this.workspaceCopier.cleanup(stagingRoot);
    }
  }

  #normalizeLinuxArtifactNames(targets) {
    const releaseDirectory = path.join(this.sourceRoot, "release");
    const sourceVersion = this.packageVersion;
    const displayVersion = formatDisplayVersion(sourceVersion);

    for (const target of targets) {
      const sourceArtifactName = `MasterCrafter-${sourceVersion}.${target}`;
      const targetArtifactName = `MasterCrafter-${displayVersion}.${target}`;
      const sourceArtifactPath = path.join(releaseDirectory, sourceArtifactName);
      const targetArtifactPath = path.join(releaseDirectory, targetArtifactName);

      if (sourceArtifactPath !== targetArtifactPath && existsSync(sourceArtifactPath)) {
        rmSync(targetArtifactPath, { force: true });
        renameSync(sourceArtifactPath, targetArtifactPath);
      }
    }
  }

  #resolvePackageVersion() {
    const envVersion = process.env.npm_package_version;
    if (typeof envVersion === "string" && envVersion.length > 0) {
      return envVersion;
    }

    const packageJsonPath = path.join(this.sourceRoot, "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
      throw new Error(`Invalid package version in ${packageJsonPath}`);
    }

    return packageJson.version;
  }
}

export { PackagingOrchestrator };
