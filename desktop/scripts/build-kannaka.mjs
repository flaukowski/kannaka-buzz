#!/usr/bin/env node
/**
 * build-kannaka — produce the Kannaka-branded desktop bundle (ADR-0052 Tier 2).
 *
 * Wraps `tauri build` with two things the plain command will not do for you:
 *
 *   1. Runs check-kannaka-theme first. The brand overlay fails SILENTLY when
 *      upstream renames a token, so the guard has to run before every branded
 *      build, not on request.
 *   2. Merges tauri.kannaka.conf.json over the base config via Tauri v2's
 *      `--config` deep merge, which supplies productName and a distinct bundle
 *      identifier without editing upstream's tauri.conf.json.
 *
 * The distinct identifier is deliberate: a Kannaka build installs ALONGSIDE
 * stock Buzz rather than replacing it, and gets its own app-data directory.
 * Register the ACP harness into that directory with:
 *
 *   node scripts/install-buzz-harness.mjs --identifier love.kannaka.buzz.app
 *
 * (that script lives in the kannaka-memory repo).
 *
 * Any extra arguments are forwarded to `tauri build`, e.g. `--debug`.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
const CONFIG = "src-tauri/tauri.kannaka.conf.json";

const run = (cmd, args, opts = {}) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: DESKTOP, shell: process.platform === "win32", ...opts });
  if (res.error) {
    console.error(`failed to run ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
};

// Guard first — a failed overlay must stop the build, not ship stock colours.
run(process.execPath, [join(HERE, "check-kannaka-theme.mjs")]);

const forwarded = process.argv.slice(2);
run("pnpm", ["exec", "tauri", "build", "--config", CONFIG, ...forwarded]);

console.log("\nKannaka Buzz bundle built.");
