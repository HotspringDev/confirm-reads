import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const name = "confirm-reads";
const inject = [];

const DEFAULT_TOOLS = ["read", "glob", "grep", "bash"];
const DEFAULT_STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "state.json",
);

// Mutable plugin-global state, shared by every session of this process.
// `enabled` and `tools` are rehydrated from the state file on apply, so a
// toggle performed with /confirm-reads survives a process restart.
let enabled = true;
let tools = [...DEFAULT_TOOLS];

function loadState(stateFile) {
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    const data = JSON.parse(raw);
    return {
      enabled: typeof data.enabled === "boolean" ? data.enabled : true,
      tools: Array.isArray(data.tools) ? data.tools : null,
    };
  } catch {
    return null;
  }
}

function apply(ctx, config = {}) {
  const cfgTools = Array.isArray(config.tools) ? config.tools : DEFAULT_TOOLS;
  const stateFile = config.stateFile ?? DEFAULT_STATE_FILE;
  const state = loadState(stateFile);
  enabled = state?.enabled ?? true;
  tools = state?.tools ?? [...cfgTools];

  const persist = () => {
    try {
      fs.writeFileSync(stateFile, JSON.stringify({ enabled, tools }, null, 2));
    } catch (error) {
      ctx.logger?.warn?.("confirm-reads: failed to persist state", error);
    }
  };

  ctx.on("tools/pre-execute", async (exec, next) => {
    if (!enabled) return next();
    if (!tools.includes(exec.name)) return next();

    // danger-full-access is deliberately out of scope: the approval policy is
    // 'never' there, and this plugin only governs confined modes
    // (workspace-write / read-only). Reads flow freely under full access.
    const sandboxPolicy = ctx.get("sandboxPolicy");
    if (sandboxPolicy) {
      let mode;
      try {
        mode = sandboxPolicy.resolve({ session: exec.agent?.session }).mode;
      } catch {
        mode = undefined;
      }
      if (mode === "danger-full-access") return next();
    }

    return {
      kind: "ask",
      reason: `Blocked by confirm-reads: "${exec.name}" runs only after you approve.`,
    };
  });

  ctx.inject(["commands"], (commandCtx) => {
    commandCtx.commands.register({
      name: "confirm-reads",
      description: "Toggle read confirmation: on | off | status | tools <list>",
      input: { hint: "on | off | status | tools <read glob grep bash>" },
      handler: ({ rawInput }) => {
        const args = rawInput.trim().split(/\s+/).filter(Boolean);
        const verb = args[0] ?? "";
        if (verb === "" || verb === "status") {
          return {
            kind: "success",
            text: `confirm-reads is ${enabled ? "ON" : "OFF"}; gating tools: ${tools.join(", ")} (danger-full-access mode is exempt)`,
          };
        }
        if (verb === "on") {
          enabled = true;
          persist();
          return { kind: "success", text: "confirm-reads ON — read-capable tools will prompt for approval" };
        }
        if (verb === "off") {
          enabled = false;
          persist();
          return { kind: "success", text: "confirm-reads OFF — read-capable tools no longer prompt" };
        }
        if (verb === "tools") {
          if (args.length < 2) return { kind: "error", text: "usage: /confirm-reads tools <tool tool ...>" };
          tools = args.slice(1);
          persist();
          return { kind: "success", text: `gating tools set to: ${tools.join(", ")}` };
        }
        return { kind: "error", text: `unknown argument "${verb}" (use on | off | status | tools <list>)` };
      },
    });
  });
}

export { name, inject, apply };
