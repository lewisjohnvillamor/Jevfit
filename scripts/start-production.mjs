import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

const port = process.env.PORT || "3000";
const sourceConfig = "dist/server/wrangler.json";
const runtimeConfig = "dist/server/.wrangler.runtime.json";
const config = JSON.parse(readFileSync(sourceConfig, "utf8"));

if (process.env.TYPESAFE_API_KEY) {
  config.vars = {
    ...config.vars,
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
  };
}

writeFileSync(runtimeConfig, JSON.stringify(config), { mode: 0o600 });

function removeRuntimeConfig() {
  try {
    unlinkSync(runtimeConfig);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const child = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    runtimeConfig,
    "--local",
    "--ip",
    "0.0.0.0",
    "--port",
    port,
    "--inspector-port",
    "0",
    "--log-level",
    "warn",
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } }
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
    removeRuntimeConfig();
  });
}

child.on("exit", (code, signal) => {
  removeRuntimeConfig();
  process.exitCode = signal ? 1 : code ?? 1;
});
