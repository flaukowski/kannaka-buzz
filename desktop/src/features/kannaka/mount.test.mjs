/**
 * Behaviour tests for the crest injection.
 *
 * The desktop test runner is plain node:test with no jsdom, so these drive
 * `injectCrest` through a minimal ParentNode stub. That is enough to cover the
 * two things that can actually go wrong in this module:
 *
 *  1. Idempotency. The MutationObserver fires again on our own insertion, and
 *     again on every React re-render of the landing screen. A missing
 *     already-present check would stack a crown per render.
 *  2. Absence. Every screen except onboarding has no wordmark, so the common
 *     case is "do nothing" and it must not throw.
 *
 * What this deliberately does NOT claim to cover: that the selector matches
 * real upstream markup. A stub will answer whatever it is told to. That link is
 * held by check-kannaka-theme.mjs, which asserts the asset and the anchor
 * statically against upstream's actual source.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { injectCrest } from "./mount.ts";

/** Minimal stand-in for the wordmark's parent element. */
function makeFrame() {
  return {
    children: [],
    querySelector(sel) {
      return sel === ".kannaka-crest"
        ? (this.children.find((c) => c.includes("kannaka-crest")) ?? null)
        : null;
    },
    insertAdjacentHTML(position, html) {
      assert.equal(position, "beforeend", "crest must go after the wordmark");
      this.children.push(html);
    },
  };
}

/** Scope whose querySelector resolves the wordmark to `frame`'s child. */
function makeScope(frame) {
  return {
    querySelector(sel) {
      if (!sel.includes("buzz-wordmark.png")) return null;
      return frame ? { parentElement: frame } : null;
    },
  };
}

test("injects the crest beside the wordmark", () => {
  const frame = makeFrame();
  assert.equal(injectCrest(makeScope(frame)), true);
  assert.equal(frame.children.length, 1);
  assert.match(frame.children[0], /class="kannaka-crest"/);
  assert.match(frame.children[0], /Kannaka<\/text>/);
});

test("is idempotent — a re-render does not stack a second crown", () => {
  const frame = makeFrame();
  assert.equal(injectCrest(makeScope(frame)), true);
  assert.equal(injectCrest(makeScope(frame)), false);
  assert.equal(injectCrest(makeScope(frame)), false);
  assert.equal(frame.children.length, 1);
});

test("no-ops on screens without the wordmark", () => {
  const scope = { querySelector: () => null };
  assert.equal(injectCrest(scope), false);
});

test("no-ops when the wordmark somehow has no parent", () => {
  const scope = { querySelector: () => ({ parentElement: null }) };
  assert.equal(injectCrest(scope), false);
});

test("carries the theme's custom properties rather than baked colours", () => {
  // The crest is a live DOM SVG specifically so it can read --kannaka-* from
  // the page. If these ever become literals, it has silently been turned into
  // something a CSS background could have done, and theming stops reaching it.
  const frame = makeFrame();
  injectCrest(makeScope(frame));
  const svg = frame.children[0];
  assert.match(svg, /var\(--kannaka-crown-gold\)/);
  assert.match(svg, /var\(--kannaka-crest-ink\)/);
});
