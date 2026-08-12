#!/usr/bin/env node
/**
 * Offline smoke test.
 *
 * Starts the built server over stdio with every Meta credential removed from
 * the environment and asserts, over the real MCP protocol, that:
 *
 *   1. The server starts and completes `initialize` with no credentials.
 *   2. It advertises itself under the expected name.
 *   3. It exposes exactly EXPECTED_TOOL_COUNT tools.
 *
 * This makes the tool count in README.md a tested claim rather than a number
 * somebody typed. It never contacts the Meta API.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";

const EXPECTED_TOOL_COUNT = 49;
const EXPECTED_SERVER_NAME = "placard";
const TIMEOUT_MS = 30_000;

if (!existsSync("dist/index.js")) {
  console.error("dist/index.js not found. Run `pnpm build` first.");
  process.exit(1);
}

// Strip anything that could make the server reach for a real account.
const env = { ...process.env, SQLITE_DB_PATH: ":memory:" };
for (const key of [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_ACCESS_TOKEN",
  "META_OAUTH_CALLBACK_URL",
]) {
  delete env[key];
}

const child = spawn(process.execPath, ["dist/index.js"], {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});

const timer = setTimeout(() => {
  child.kill("SIGKILL");
  fail(`no response within ${TIMEOUT_MS}ms`);
}, TIMEOUT_MS);

function fail(message) {
  clearTimeout(timer);
  child.kill("SIGKILL");
  console.error(`smoke test FAILED: ${message}`);
  process.exit(1);
}

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

const responses = new Map();
createInterface({ input: child.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id !== undefined) responses.set(message.id, message);
  if (responses.has(1) && !responses.has(2)) {
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  }
  if (responses.has(2)) check();
});

child.on("error", (error) => fail(String(error)));
child.on("exit", (code) => {
  if (!responses.has(2)) fail(`server exited early with code ${code}`);
});

function check() {
  const init = responses.get(1);
  const list = responses.get(2);

  if (init.error) fail(`initialize returned an error: ${JSON.stringify(init.error)}`);
  if (list.error) fail(`tools/list returned an error: ${JSON.stringify(list.error)}`);

  const name = init.result?.serverInfo?.name;
  if (name !== EXPECTED_SERVER_NAME) {
    fail(`server name is "${name}", expected "${EXPECTED_SERVER_NAME}"`);
  }

  const tools = list.result?.tools ?? [];
  if (tools.length !== EXPECTED_TOOL_COUNT) {
    fail(
      `server exposes ${tools.length} tools, expected ${EXPECTED_TOOL_COUNT}. ` +
        "Update EXPECTED_TOOL_COUNT here and the count in README.md together.",
    );
  }

  const unnamed = tools.filter((tool) => !tool.name?.startsWith("meta_"));
  if (unnamed.length > 0) {
    fail(`tools without the meta_ prefix: ${unnamed.map((t) => t.name).join(", ")}`);
  }

  clearTimeout(timer);
  child.kill("SIGTERM");
  console.log(
    `smoke test OK: "${name}" started with no credentials and exposed ${tools.length} tools`,
  );
  process.exit(0);
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "placard-smoke-test", version: "0.0.0" },
  },
});
