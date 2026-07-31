/**
 * The crest actually reaches the page.
 *
 * WHY THIS EXISTS
 * ---------------
 * The crest is injected at runtime by features/kannaka/mount.ts rather than
 * imported by a component, which is what stopped it conflicting on every
 * upstream sync. The cost of that trade is that every way it can break is
 * SILENT: a renamed asset, a dropped script tag in index.html, a `:has()`
 * anchor that no longer matches — none of them throw. The build stays green and
 * onboarding just quietly looks like stock Buzz.
 *
 * check-kannaka-theme.mjs asserts the chain is wired and mount.test.mjs asserts
 * the injection logic, but neither observes a real page. Until this spec existed
 * nothing in CI would have caught the crest simply being absent.
 *
 * Lives in its own file on purpose: our brand pins inside upstream's
 * identity-lost.spec.ts are themselves a recurring merge-conflict surface, and
 * a Kannaka-owned spec adds none.
 */

import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";

/** Artwork geometry, mirroring src/features/kannaka/crest.ts. */
const ARTWORK_WIDTH = 777;
const CROWN_HEADROOM = 70;

test("the Kannaka crest is mounted over the landing wordmark", async ({
  page,
}) => {
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");

  await expect(page.getByTestId("machine-onboarding-gate")).toBeVisible();

  const crest = page.locator(".kannaka-crest");
  const wordmark = page.locator('img[src$="buzz-wordmark.png"]');

  // Present at all — the failure the runtime mount makes possible.
  await expect(wordmark).toBeVisible();
  await expect(crest).toHaveCount(1);
  await expect(crest).toBeVisible();

  // It is the lockup, not an empty SVG: the word has to be in there.
  await expect(crest.locator("title")).toHaveText("Kannaka");

  const crestBox = await crest.boundingBox();
  const wordBox = await wordmark.boundingBox();
  if (!crestBox || !wordBox) throw new Error("crest or wordmark has no box");

  // Laid out, not collapsed. An unmatched CSS anchor yields a zero box.
  expect(crestBox.width).toBeGreaterThan(0);
  expect(crestBox.height).toBeGreaterThan(0);

  // Spans the artwork: CSS sizes it from the image's own box, so a drift here
  // means `min(100%, 600px)` stopped tracking upstream's `w-full max-w-[600px]`.
  expect(Math.abs(crestBox.width - wordBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(crestBox.x - wordBox.x)).toBeLessThanOrEqual(2);

  // The crown rises ABOVE the artwork. This is the assertion that proves the
  // translateY lift resolved against the crest's own height rather than the
  // parent flex column's — the bug that would put the crown somewhere unrelated.
  expect(crestBox.y).toBeLessThan(wordBox.y);

  const expectedLift = (wordBox.width * CROWN_HEADROOM) / ARTWORK_WIDTH;
  expect(Math.abs(wordBox.y - crestBox.y - expectedLift)).toBeLessThanOrEqual(2);
});

test("the crest is not injected twice across a re-render", async ({ page }) => {
  await installMockBridge(page, undefined, {
    skipCommunitySeed: true,
    skipOnboardingSeed: true,
  });
  await page.goto("/");

  await expect(page.getByTestId("machine-onboarding-gate")).toBeVisible();
  await expect(page.locator(".kannaka-crest")).toHaveCount(1);

  // Advancing the flow re-renders the landing subtree, which fires the
  // MutationObserver again. Exactly one crest must survive that.
  await page.getByRole("button", { name: "Create a new identity key" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your unique identity key has been created",
    }),
  ).toBeVisible();

  await expect(page.locator(".kannaka-crest")).toHaveCount(
    await page.locator('img[src$="buzz-wordmark.png"]').count(),
  );
});
