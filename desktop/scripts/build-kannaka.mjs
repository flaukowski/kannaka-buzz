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
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");
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
 * `shell` is opt-in per call, not global. On Windows a shell is needed to
 * resolve `pnpm` (a .cmd shim), but running node through a shell breaks on the
 * space in "C:\Program Files\nodejs\node.exe" — cmd.exe splits the path.
 */
const run = (cmd, args, { useShell = false } = {}) => {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: DESKTOP,
    shell: useShell,
  });
  if (res.error) {
    console.error(`failed to run ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
};

// Guard first — a failed overlay must stop the build, not ship stock colours.
run(process.execPath, [join(HERE, "check-kannaka-theme.mjs")]);

/**
 * Tauri validates every `externalBin` entry exists at compile time, so the
 * sidecars must be present before the build starts. This mirrors upstream's
 * own `just desktop-release-build`, which touches empty placeholders for a
 * local unsigned build; the real binaries are swapped in by the signed release
 * pipeline.
 *
 * Consequence worth knowing: in a build produced this way the BUNDLED sidecars
 * are empty, so anything depending on them is inert. The Kannaka harness is
 * unaffected — it points at an absolute path outside the bundle.
 */
function stageSidecarStubs() {
  const probe = spawnSync("rustc", ["-vV"], { encoding: "utf8" });
  const target = probe.stdout?.match(/^host:\s*(.+)$/m)?.[1]?.trim();
  if (!target) {
    console.error(
      "could not determine the rustc host triple — is rustc on PATH?",
    );
    process.exit(1);
  }
  const dir = join(DESKTOP, "src-tauri", "binaries");
  mkdirSync(dir, { recursive: true });
  const created = [];
  for (const bin of SIDECARS) {
    const p = join(
      dir,
      `${bin}-${target}${process.platform === "win32" ? ".exe" : ""}`,
    );
    if (!existsSync(p)) {
      closeSync(openSync(p, "w"));
      created.push(`${bin}-${target}`);
    }
  }
  if (created.length) {
    console.warn(
      `\nwarning: staged ${created.length} EMPTY sidecar placeholder(s): ${created.join(", ")}.\n` +
        "  This matches upstream's local unsigned-build recipe. The bundled sidecars\n" +
        "  are inert; build them for real before distributing this bundle.",
    );
  }
}

stageSidecarStubs();

const forwarded = process.argv.slice(2);
run("pnpm", ["exec", "tauri", "build", "--config", CONFIG, ...forwarded], {
  useShell: process.platform === "win32",
});

console.log("\nKannaka Buzz bundle built.");
