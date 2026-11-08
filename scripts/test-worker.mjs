import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";

const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const worker = spawn(
  process.execPath,
  [
    "node_modules/wrangler/wrangler-dist/cli.js",
    "dev",
    "--local",
    "--port",
    String(port),
    "--ip",
    "127.0.0.1",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
for (const stream of [worker.stdout, worker.stderr])
  stream.on("data", (data) => {
    output = (output + data).slice(-16000);
  });
let closed = false;
worker.once("exit", () => {
  closed = true;
});
try {
  console.log(
    "Starting a local Worker for HTTP/MCP/media integration checks...",
  );
  const deadline = Date.now() + 120000;
  let ready = false;
  while (Date.now() < deadline && !closed) {
    try {
      const response = await fetch(origin, {
        signal: AbortSignal.timeout(3000),
      });
      await response.arrayBuffer();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Waiting for the local runtime. */
    }
    await setTimeout(1000);
  }
  if (!ready) throw new Error("Worker did not become ready.\n" + output);
  const checks = spawn(process.execPath, ["scripts/smoke-test.mjs"], {
    stdio: "inherit",
    env: { ...process.env, TEST_ORIGIN: origin },
  });
  const code = await new Promise((resolve, reject) => {
    checks.once("error", reject);
    checks.once("exit", resolve);
  });
  if (code !== 0)
    throw new Error("Worker integration checks failed.\n" + output);
} finally {
  worker.kill("SIGINT");
}
