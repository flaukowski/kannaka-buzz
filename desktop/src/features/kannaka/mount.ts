/**
 * Mounts the Kannaka crest onto the Buzz landing wordmark without any upstream
 * component knowing it exists.
 *
 * WHY THIS ISN'T A REACT IMPORT
 * -----------------------------
 * The crest used to be `<KannakaCrest />` inside `MachineOnboardingFlow`. That
 * cost two edits in an upstream file which changed 20 times in the last year,
 * and one of them sat in the import block — the single busiest region of any
 * source file, since every new dependency lands there. The first conflicting
 * sync (upstream adding `DownloadKeyStep` beside our import) was that bill
 * coming due, and it would have kept arriving.
 *
 * Loading from `index.html` instead moves our only upstream touchpoint to a
 * file that changed 6 times in the same year, in a region (`<body>`, after the
 * app entry) that none of those changes touched. Zero upstream .tsx files now
 * reference Kannaka.
 *
 * WHY IT DOESN'T REPARENT THE IMAGE
 * ---------------------------------
 * The obvious implementation wraps the wordmark in a positioned frame. Don't:
 * moving a React-owned node to a new parent means React later calls
 * `removeChild` against a parent that no longer holds it, which throws at
 * unmount. So the crest is appended as a *sibling* of the image and positioned
 * against their shared parent, which `kannaka-theme.css` makes `position:
 * relative` via `:has()`. React only ever removes nodes it created; an extra
 * trailing child is untouched, and it disappears with the parent on unmount.
 *
 * The crest is absolutely positioned and sized in CSS from the image's own box
 * (`min(100%, 600px)`, the artwork's aspect ratio), so nothing here measures
 * anything — there is no resize listener to leak and no layout thrash.
 */

import { CREST_CLASS, CREST_SVG } from "./crest";

/**
 * The anchor. Matching on the asset rather than a class means we depend on
 * something upstream renders for its own reasons, not on markup we asked them
 * to keep. If they rename the asset, `check-kannaka-theme.mjs` fails the build
 * — the crest silently not rendering is the failure this whole file exists to
 * avoid, so it must not be able to fail quietly.
 */
const WORDMARK = 'img[src$="buzz-wordmark.png"]';

/**
 * Injects the crest beside the wordmark, if it is present and not already
 * there. Returns whether it inserted, which is what makes the idempotency
 * testable — a duplicate-injection bug would stack crowns on every re-render.
 *
 * Takes its scope as an argument so this is exercisable without a DOM
 * environment; the desktop test runner is plain node:test with no jsdom.
 */
export function injectCrest(scope: ParentNode = document): boolean {
  const wordmark = scope.querySelector(WORDMARK);
  const frame = wordmark?.parentElement;
  if (!frame) return false;
  // Idempotent: the observer fires again on our own insertion.
  if (frame.querySelector(`.${CREST_CLASS}`)) return false;
  frame.insertAdjacentHTML("beforeend", CREST_SVG);
  return true;
}

function start(): void {
  injectCrest();

  // The landing screen mounts (and remounts, on sign-out) long after this
  // module runs, so a one-shot injection would miss it. The callback is a
  // single querySelector and is coalesced to one run per frame, which keeps
  // this cheap enough to leave observing for the session.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      injectCrest();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

// Bootstrap only in a real document. Guarding this keeps the module importable
// from node:test, which has no DOM.
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
