import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { api } from "../server/api.js";
const children: ChildProcess[] = [];
const motisURL = process.env.MOTIS_URL || "http://127.0.0.1:8080";
const pidFile = "var/dev.pid";
let closing = false;
let ownsGuard = false;

// Keep the refresh guard until the children have exited, even during shutdown.
process.once("exit", () => {
  if (!ownsGuard) return;
  try {
    if (readFileSync(pidFile, "utf8") === String(process.pid))
      unlinkSync(pidFile);
  } catch {}
});

function stop(exitCode = 0) {
  if (closing) return;
  closing = true;
  process.exitCode = exitCode;
  for (const child of children) child.kill("SIGTERM");
  server.close();
  server.closeAllConnections();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

async function main() {
  // Bind before touching the shared guard or launching children.
  const listening = once(server, "listening");
  server.listen(8787, "127.0.0.1");
  await listening;
  if (closing) return;
  mkdirSync("var", { recursive: true });
  writeFileSync(pidFile, String(process.pid));
  ownsGuard = true;
  console.log("API http://127.0.0.1:8787");

  let running = false;
  try {
    const r = await fetch(
      motisURL + "/api/v1/geocode?text=Chedde&numResults=1",
      { signal: AbortSignal.timeout(1000) },
    );
    running = r.ok;
    await r.body?.cancel();
  } catch {}
  if (closing) return;
  if (!running && !process.env.MOTIS_URL && existsSync("var/motis/data")) {
    const motis = spawn(resolve("var/bin/motis"), ["server"], {
      cwd: resolve("var/motis"),
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(motis);
    motis.stdout?.on("data", (d) => process.stdout.write("[motis] " + d));
    motis.stderr?.on("data", (d) => process.stderr.write("[motis] " + d));
    motis.on("error", (e) => console.error(e.message));
  } else if (!running)
    console.log(
      "Map available; run npm run setup to prepare the routing engine.",
    );
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  });
  children.push(vite);
  vite.on("exit", (code) => stop(code ?? 0));
}
const server = createServer(async (req, res) => {
  try {
    const r = await api(
      new Request("http://localhost" + req.url, { method: req.method }),
      {
        motis: (path, signal) => {
          const timeout = AbortSignal.timeout(45000);
          return fetch(motisURL + path, {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
        },
      },
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("API error");
  }
});
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  stop(1);
});
