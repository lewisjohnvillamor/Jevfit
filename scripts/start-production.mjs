import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const child = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "dist/server/wrangler.json",
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
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1;
});
