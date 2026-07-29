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
 *   node scripts/install-buzz-harness.mjs --identifier love.kannaka.buzz
 *
 * (that script lives in the kannaka-memory repo).
 *
 * The identifier deliberately does NOT end in `.app` — Tauri warns that this
 * collides with the macOS application bundle extension.
 *
 * Native prerequisite: `cmake` must be on PATH (audiopus_sys builds Opus for
 * huddles). Windows users generally have one inside Visual Studio /  Build
 * Tools at Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin.
 *
 * Any extra arguments are forwarded to `tauri build`, e.g. `--debug`.
 */
import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
/** Workspace root — the sidecar crates live here, not under desktop/. */
const REPO = join(DESKTOP, "..");
const CONFIG = "src-tauri/tauri.kannaka.conf.json";

/** Must stay in sync with `externalBin` in tauri.conf.json. */
const SIDECARS = [
  "buzz-acp",
  "buzz-agent",
  "buzz-dev-mcp",
  "git-credential-nostr",
  "buzz",
];

/**
 * The Hive is this build's home relay (ADR-0045). Upstream already exposes
 * every seam needed for that, so tying the two together costs NO code:
 *
 *   BUZZ_RELAY_URL / BUZZ_RELAY_HTTP     baked in by build.rs as the default
 *                                        relay, still overridable at runtime by
 *                                        the same env vars and by a workspace
 *                                        override, which win over the build.
 *   BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY  connect on first run instead of
 *                                        making the user pick a community.
 *
 * Override any of them in the environment to point a build somewhere else.
 */
const HIVE_DEFAULTS = {
  BUZZ_RELAY_URL: "wss://buzz.ninja-portal.com",
  BUZZ_RELAY_HTTP: "https://buzz.ninja-portal.com",
  BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY: "1",
};

/**
 * `shell` is opt-in per call, not global. On Windows a shell is needed to
 * resolve `pnpm` (a .cmd shim), but running node through a shell breaks on the
 * space in "C:\Program Files\nodejs\node.exe" — cmd.exe splits the path.
 */
const run = (cmd, args, { useShell = false, cwd = DESKTOP, env } = {}) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd,
    shell: useShell,
    env,
  });
  if (res.error) {
    console.error(`failed to run ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
};

// Guard first — a failed overlay must stop the build, not ship stock colours.
run(process.execPath, [join(HERE, "check-kannaka-theme.mjs")]);

function hostTriple() {
  const probe = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
  const target = probe.stdout?.match(/^host:\s*(.+)$/m)?.[1]?.trim();
  if (!target) {
    console.error(
      "could not determine the rustc host triple — is rustc on PATH?",
    );
    process.exit(1);
  }
  return target;
}

const sidecarPath = (dir, bin, target) =>
  join(dir, `${bin}-${target}${process.platform === "win32" ? ".exe" : ""}`);

/**
 * Build the sidecars from the workspace and stage them under their
 * target-triple names.
 *
 * These are NOT optional garnish. `buzz-acp` is the host that spawns every ACP
 * harness — and the desktop resolves it from beside its own executable BEFORE
 * falling back to PATH (agent_auth.rs), testing only that the file exists. A
 * zero-byte placeholder therefore wins that lookup and every agent silently
 * fails to start, Kannaka included. `buzz` is how an agent posts replies into a
 * channel; `git-credential-nostr` authenticates git over NIP-98.
 */
function stageSidecars({ stub }) {
  const target = hostTriple();
  const dir = join(DESKTOP, "src-tauri", "binaries");
  mkdirSync(dir, { recursive: true });

  if (stub) {
    const created = [];
    for (const bin of SIDECARS) {
      const p = sidecarPath(dir, bin, target);
      if (!existsSync(p)) {
        closeSync(openSync(p, "w"));
        created.push(bin);
      }
    }
    console.warn(
      `\nwarning: --stub-sidecars staged EMPTY placeholders (${created.join(", ") || "all present"}).\n` +
        "  Agents will NOT run in this bundle. Use only for UI-only builds.",
    );
    return;
  }

  const cargoTarget = process.env.CARGO_TARGET_DIR
    ? process.env.CARGO_TARGET_DIR
    : join(REPO, "target");
  run(
    "cargo",
    ["build", "--release", ...SIDECARS.flatMap((bin) => ["--bin", bin])],
    { cwd: REPO, useShell: process.platform === "win32" },
  );

  for (const bin of SIDECARS) {
    const built = join(
      cargoTarget,
      "release",
      `${bin}${process.platform === "win32" ? ".exe" : ""}`,
    );
    if (!existsSync(built)) {
      console.error(`sidecar ${bin} did not build to ${built}`);
      process.exit(1);
    }
    const staged = sidecarPath(dir, bin, target);
    copyFileSync(built, staged);
    const { size } = statSync(staged);
    if (size === 0) {
      console.error(`staged sidecar ${bin} is empty — refusing to bundle it`);
      process.exit(1);
    }
    console.log(`  sidecar ${bin} -> ${(size / 1024 / 1024).toFixed(1)} MB`);
  }
}

stageSidecars({ stub: process.argv.includes("--stub-sidecars") });

// Ambient env wins, so a build can be pointed at another relay without edits.
const buildEnv = { ...process.env };
for (const [key, value] of Object.entries(HIVE_DEFAULTS)) {
  buildEnv[key] ??= value;
}
console.log(
  `\nrelay     : ${buildEnv.BUZZ_RELAY_URL}` +
    `\nautoconnect: ${buildEnv.BUZZ_BUILD_AUTO_CONNECT_DEFAULT_RELAY === "1" ? "on" : "off"}`,
);

const forwarded = process.argv.slice(2).filter((a) => a !== "--stub-sidecars");
run("pnpm", ["exec", "tauri", "build", "--config", CONFIG, ...forwarded], {
  useShell: process.platform === "win32",
  env: buildEnv,
});

console.log("\nKannaka Buzz bundle built.");
