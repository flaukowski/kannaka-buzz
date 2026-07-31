#!/usr/bin/env node
/**
 * check-kannaka-theme — guard the Kannaka theme overlay against upstream drift.
 *
 * ADR-0052 records the characteristic failure of a CSS override: it is coupled
 * to token NAMES. If upstream renames `--buzz-gradient-light-top`, or drops the
 * `[data-buzz-sidebar]` convention, `kannaka-theme.css` keeps parsing and keeps
 * applying nothing. The branded build would then quietly ship stock Buzz
 * colours, and nobody would notice until someone looked at it.
 *
 * So: assert that every token the overlay overrides is still declared upstream,
 * and that the selector it hangs on still exists. Fail loudly instead.
 *
 * Run standalone, or via `node desktop/scripts/build-kannaka.mjs`, which runs
 * it before invoking Tauri.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..");

const THEME = join(DESKTOP, "src/shared/styles/globals/theme.css");
const OVERLAY = join(DESKTOP, "src/shared/styles/globals/kannaka-theme.css");
const GLOBALS = join(DESKTOP, "src/shared/styles/globals.css");
const COMPONENTS = join(DESKTOP, "src/shared/styles/globals/components.css");

/**
 * Tokens the overlay redefines. Each must still be DECLARED in upstream's
 * theme.css — if it is not, either upstream renamed it (our override is now
 * dead) or we are overriding something that no longer exists.
 */
const TOKENS = [
  "--buzz-gradient-light-top",
  "--buzz-gradient-light-bottom",
  "--buzz-gradient-dark-top",
  "--buzz-gradient-dark-bottom",
  // NB the active-pill tokens are intentionally absent — see ACTIVE_PILL_TOKENS
  // below, which asserts the opposite: that we never override them.
  "--primary",
  "--primary-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--ring",
];

/**
 * Landing-screen tokens. These live in components.css under a DIFFERENT scope
 * (`.buzz-onboarding-neutral-theme`), because the welcome screen renders before
 * a workspace theme exists and never carries `data-buzz-sidebar`.
 */
const LANDING_TOKENS = [
  "--buzz-welcome-chartreuse",
  "--buzz-onboarding-shell-bottom",
];

/** Selectors the overlay's scoping strategy depends on, and where each lives. */
const SELECTOR = ":root[data-buzz-sidebar]";
const LANDING_SELECTOR = ".buzz-onboarding-neutral-theme";

const problems = [];

for (const file of [THEME, OVERLAY, GLOBALS, COMPONENTS]) {
  if (!existsSync(file)) problems.push(`missing file: ${file}`);
}
if (problems.length) {
  console.error("kannaka-theme check FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const theme = readFileSync(THEME, "utf8");
const overlay = readFileSync(OVERLAY, "utf8");
const globals = readFileSync(GLOBALS, "utf8");
const components = readFileSync(COMPONENTS, "utf8");

// A declaration, not merely a mention: `--token:` with optional whitespace.
const declares = (css, token) =>
  new RegExp(`${token.replace(/-/g, "\\-")}\\s*:`).test(css);

for (const token of TOKENS) {
  if (!declares(theme, token)) {
    problems.push(
      `${token} is no longer declared in theme.css — the overlay's override is dead. ` +
        `Find its replacement upstream, update kannaka-theme.css, then update TOKENS here.`,
    );
  }
  if (!declares(overlay, token)) {
    problems.push(
      `${token} is listed in TOKENS but not declared in kannaka-theme.css — TOKENS is stale.`,
    );
  }
}

for (const token of LANDING_TOKENS) {
  if (!declares(components, token)) {
    problems.push(
      `${token} is no longer declared in components.css — the landing overlay is dead, ` +
        "so the welcome screen would silently revert to stock chartreuse.",
    );
  }
  if (!declares(overlay, token)) {
    problems.push(
      `${token} is listed in LANDING_TOKENS but not declared in kannaka-theme.css.`,
    );
  }
}

if (!theme.includes(SELECTOR)) {
  problems.push(
    `theme.css no longer contains "${SELECTOR}" — Buzz changed how it scopes brand tokens, ` +
      "so the overlay is scoped to a selector that never matches.",
  );
}

if (!components.includes(LANDING_SELECTOR)) {
  problems.push(
    `components.css no longer contains "${LANDING_SELECTOR}" — the landing screen changed ` +
      "how it scopes its tokens, so the purple tint is scoped to a selector that never matches.",
  );
}

/*
 * The crest is injected at runtime (features/kannaka/mount.ts) instead of being
 * imported by an upstream component, which is what stopped it conflicting on
 * every sync. That trade buys merge quiet at the cost of a runtime dependency
 * on upstream markup: if the wordmark is renamed or the mount stops loading,
 * nothing errors — the crest just isn't there, and the branded build ships
 * looking like stock Buzz.
 *
 * So the whole chain is asserted here, statically. A rename upstream should
 * fail this check, not a screenshot somebody eyeballs later.
 */
const WORDMARK_ASSET = "buzz-wordmark.png";
const MOUNT_ENTRY = "/src/features/kannaka/mount.ts";
const CREST_ANCHOR = `:has(> img[src$="${WORDMARK_ASSET}"])`;

const INDEX_HTML = join(DESKTOP, "index.html");
const MOUNT = join(DESKTOP, "src/features/kannaka/mount.ts");
const ONBOARDING = join(
  DESKTOP,
  "src/features/onboarding/ui/MachineOnboardingFlow.tsx",
);

if (!existsSync(MOUNT)) {
  problems.push(`missing ${MOUNT} — nothing injects the crest.`);
} else if (!existsSync(INDEX_HTML)) {
  problems.push(`missing ${INDEX_HTML} — the mount has no entry point.`);
} else {
  const indexHtml = readFileSync(INDEX_HTML, "utf8");
  if (!indexHtml.includes(MOUNT_ENTRY)) {
    problems.push(
      `index.html no longer loads ${MOUNT_ENTRY} — an upstream sync probably ` +
        "reverted it. The crest would never mount and onboarding would ship unbranded.",
    );
  }
}

if (existsSync(ONBOARDING)) {
  const onboarding = readFileSync(ONBOARDING, "utf8");
  if (!onboarding.includes(WORDMARK_ASSET)) {
    problems.push(
      `MachineOnboardingFlow no longer renders ${WORDMARK_ASSET} — that image is ` +
        "the crest's anchor. Find what replaced it, then update WORDMARK in " +
        "src/features/kannaka/mount.ts and CREST_ANCHOR in kannaka-theme.css.",
    );
  }
}

if (!existsSync(join(DESKTOP, "public/landing", WORDMARK_ASSET))) {
  problems.push(
    `public/landing/${WORDMARK_ASSET} is gone — the crest anchors on that asset.`,
  );
}

if (!overlay.includes(CREST_ANCHOR)) {
  problems.push(
    `kannaka-theme.css no longer contains "${CREST_ANCHOR}" — the injected crest ` +
      "would have no positioned parent and would land relative to the page.",
  );
}

/*
 * Upstream E2E specs PIN brand colours as literals, so re-tinting a token
 * silently breaks tests that live nowhere near the stylesheet. Two rules fell
 * out of doing it the hard way:
 *
 *   - identity-lost.spec.ts asserts the landing fill and gradient stops. Those
 *     are brand pins, so they move with the brand — we edit them and accept the
 *     divergence.
 *   - buzz-theme-screenshots.spec.ts pins the neutral active-pill surface. We
 *     do NOT re-tint that, so this must stay unedited.
 *
 * Assert the second rule mechanically: if the overlay ever touches the
 * active-pill tokens again, fail here rather than 12 minutes into CI.
 */
const ACTIVE_PILL_TOKENS = ["--buzz-active-fill", "--buzz-active-surface"];
for (const token of ACTIVE_PILL_TOKENS) {
  if (declares(overlay, token)) {
    problems.push(
      `${token} is overridden in kannaka-theme.css, which breaks ` +
        "buzz-theme-screenshots.spec.ts — it pins the neutral surface exactly. " +
        "Leave the active pill to upstream; the gradient and accent carry the brand.",
    );
  }
}

/*
 * Third time is a rule. Upstream specs pin brand colours as LITERALS, and each
 * re-tint has been discovered by a 12-minute CI round rather than here. So:
 * enumerate the upstream values the overlay replaces, in every notation the
 * specs use, and fail if any spec still expects one.
 *
 * A hit means a brand pin was missed — update the spec's expectation to the
 * Kannaka value (these are deliberate, documented divergences), not the
 * stylesheet.
 */
const SUPERSEDED_LITERALS = [
  // workspace gradient (theme.css)
  ["#e6e6b6", "light gradient top"],
  ["#c4d0da", "light gradient bottom"],
  ["#4a4616", "dark gradient top"],
  ["#0a1423", "dark gradient bottom"],
  // landing fill + ramp (components.css)
  ["#d7d72e", "welcome chartreuse"],
  ["rgb(215, 215, 46)", "welcome chartreuse, rgb form"],
  ["#d7e7f6", "onboarding shell bottom"],
  ["rgb(215, 231, 246)", "onboarding shell bottom, rgb form"],
];

const specDir = join(DESKTOP, "tests");
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}
if (existsSync(specDir)) {
  for (const file of walk(specDir)) {
    const src = readFileSync(file, "utf8");
    for (const [literal, what] of SUPERSEDED_LITERALS) {
      if (src.includes(literal)) {
        problems.push(
          `${file.slice(DESKTOP.length + 1)} still pins ${literal} (${what}), ` +
            "which the Kannaka overlay replaces — that spec will fail in CI. " +
            "Update the expectation to the Kannaka value.",
        );
      }
    }
  }
}

// The overlay only wins on source order if it is imported after theme.css.
const overlayImport = globals.indexOf("kannaka-theme.css");
const themeImport = globals.indexOf("globals/theme.css");
if (overlayImport === -1) {
  problems.push(
    "globals.css does not import kannaka-theme.css — the overlay is never loaded.",
  );
} else if (themeImport !== -1 && overlayImport < themeImport) {
  problems.push(
    "globals.css imports kannaka-theme.css BEFORE theme.css — stock values would win.",
  );
}

if (problems.length) {
  console.error("kannaka-theme check FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nSee ADR-0052 (Consequences) for why this check exists.");
  process.exit(1);
}

console.log(
  `kannaka-theme check OK — ${TOKENS.length + LANDING_TOKENS.length} tokens still declared upstream, overlay imported last.`,
);
