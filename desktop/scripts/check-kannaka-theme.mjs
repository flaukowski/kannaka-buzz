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
import { readFileSync, existsSync } from "node:fs";
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
  "--buzz-active-fill",
  "--buzz-active-surface",
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
