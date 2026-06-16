import { spawnSync } from "node:child_process";

const electronVersion = process.env.npm_package_devDependencies_electron;

if (!electronVersion) {
  process.exit(0);
}

const child = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "electron-builder",
    "install-app-deps"
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: electronVersion,
      npm_config_disturl: "https://electronjs.org/headers",
    },
  },
);

process.exit(child.status ?? 0);
