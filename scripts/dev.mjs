import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const server = spawn(npmCommand, ["run", "dev:server"], {
  stdio: "inherit",
});
const cron = spawn(process.execPath, ["scripts/dev-cron.mjs", "--now"], {
  stdio: "inherit",
});
const children = [server, cron];
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopChildren(signal));
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (stopping) return;
    stopping = true;
    for (const other of children) {
      if (other !== child && !other.killed) other.kill("SIGTERM");
    }
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

function stopChildren(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}
