import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLUGIN_URL = new URL("../lib/index.js", import.meta.url).href;

function makeCtx(overrides = {}) {
  const ctx = {
    listeners: {},
    services: {
      sandboxPolicy: { resolve: () => ({ mode: "workspace-write" }) },
      ...(overrides.services ?? {}),
    },
    command: null,
    on(event, fn) {
      this.listeners[event] = fn;
    },
    get(service) {
      return this.services[service];
    },
    inject(_services, cb) {
      cb({ commands: { register: (cmd) => { this.command = cmd; } } });
    },
    logger: { warn() {} },
  };
  return ctx;
}

function tempStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "confirm-reads-"));
  return path.join(dir, "state.json");
}

const READ_CALL = { name: "read", agent: { session: {} } };
const NEXT = () => "NEXT";

test("module exports the cordis plugin contract", async () => {
  const mod = await import(PLUGIN_URL);
  assert.equal(mod.name, "confirm-reads");
  assert.equal(typeof mod.apply, "function");
  assert.ok(Array.isArray(mod.inject));
});

test("pre-execute asks for a gated tool under a confined mode", async () => {
  const ctx = makeCtx();
  const mod = await import(PLUGIN_URL);
  mod.apply(ctx, { tools: ["read"], stateFile: tempStateFile() });
  const pre = ctx.listeners["tools/pre-execute"];
  const decision = await pre(READ_CALL, NEXT);
  assert.equal(decision.kind, "ask");
});

test("pre-execute passes through for non-gated tools", async () => {
  const ctx = makeCtx();
  const mod = await import(PLUGIN_URL);
  mod.apply(ctx, { tools: ["read"], stateFile: tempStateFile() });
  const pre = ctx.listeners["tools/pre-execute"];
  const decision = await pre({ name: "web_search", agent: { session: {} } }, NEXT);
  assert.equal(decision, "NEXT");
});

test("danger-full-access mode is exempt", async () => {
  const ctx = makeCtx({
    services: { sandboxPolicy: { resolve: () => ({ mode: "danger-full-access" }) } },
  });
  const mod = await import(PLUGIN_URL);
  mod.apply(ctx, { tools: ["read"], stateFile: tempStateFile() });
  const pre = ctx.listeners["tools/pre-execute"];
  const decision = await pre(READ_CALL, NEXT);
  assert.equal(decision, "NEXT");
});

test("command toggles interception and persists state across apply", async () => {
  const stateFile = tempStateFile();
  const ctx = makeCtx();
  const mod = await import(PLUGIN_URL);
  mod.apply(ctx, { tools: ["read"], stateFile });
  const pre = ctx.listeners["tools/pre-execute"];

  assert.equal((await pre(READ_CALL, NEXT)).kind, "ask");

  ctx.command.handler({ rawInput: "off" });
  assert.equal(await pre(READ_CALL, NEXT), "NEXT");
  const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(saved.enabled, false);

  ctx.command.handler({ rawInput: "on" });
  assert.equal((await pre(READ_CALL, NEXT)).kind, "ask");

  // persisted state is rehydrated on a fresh apply
  ctx.command.handler({ rawInput: "off" });
  const ctx2 = makeCtx();
  mod.apply(ctx2, { tools: ["read"], stateFile });
  const pre2 = ctx2.listeners["tools/pre-execute"];
  assert.equal(await pre2(READ_CALL, NEXT), "NEXT");
});

test("tools command updates the gated list", async () => {
  const ctx = makeCtx();
  const mod = await import(PLUGIN_URL);
  mod.apply(ctx, { tools: ["read"], stateFile: tempStateFile() });
  const pre = ctx.listeners["tools/pre-execute"];

  ctx.command.handler({ rawInput: "tools read glob" });
  assert.equal(await pre({ name: "grep", agent: { session: {} } }, NEXT), "NEXT");
  assert.equal((await pre({ name: "glob", agent: { session: {} } }, NEXT)).kind, "ask");
});
