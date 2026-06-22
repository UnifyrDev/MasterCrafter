import { spawnSync } from "node:child_process";

class CommandExecutor {
  static #instance;

  static get instance() {
    if (this.#instance == null) {
      this.#instance = new CommandExecutor();
    }

    return this.#instance;
  }

  run(command, args, options = {}) {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    if (result.error != null) {
      throw result.error;
    }

    if (result.status !== 0) {
      const renderedArgs = args.length > 0 ? ` ${args.join(" ")}` : "";
      const exitCode = result.status ?? "unknown";
      throw new Error(`Command failed with exit code ${exitCode}: ${command}${renderedArgs}`);
    }
  }
}

export { CommandExecutor };
