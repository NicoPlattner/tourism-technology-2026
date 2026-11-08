import { spawn } from "node:child_process";
// One development command starts both services; secrets are loaded only by the API child.
const api = spawn(
  process.execPath,
  [
    "--env-file-if-exists=.env",
    "--use-env-proxy",
    "--import",
    "tsx",
    "--watch",
    "server/index.ts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CAPTION_PORT: "8788",
      CAPTION_ALLOWED_ORIGINS:
        "http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173",
    },
  },
);
const analytics = spawn(process.execPath, ["server/server.mjs"], { stdio: "inherit" });
const web = spawn("npm", ["run", "dev:web", "--", ...process.argv.slice(2)], {
  stdio: "inherit",
});
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
  analytics.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exitCode = code;
}
analytics.on("exit", (code) => stop(code || 0));
api.on("exit", (code) => stop(code || 0));
web.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
