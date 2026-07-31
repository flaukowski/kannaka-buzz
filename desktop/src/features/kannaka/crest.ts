/**
 * KannakaCrest — the Kannaka lockup over the Buzz landing wordmark.
 *
 * ADR-0052: Kannaka-owned UI lives under `features/kannaka/`. This used to be a
 * React component imported by upstream's `MachineOnboardingFlow`, which put a
 * Kannaka import inside the busiest region of an actively-developed upstream
 * file — the import block. Three syncs in, that is exactly where the first
 * merge conflict landed. It is now plain markup mounted from `./mount`, so no
 * upstream component references Kannaka at all.
 *
 * The overlay is a single SVG whose viewBox is expressed in the wordmark PNG's
 * own pixel space (777x326), extended upward so the crown can rise above the
 * artwork. Coordinates below are therefore read directly off the image:
 *
 *   "B"    x 40..230,  cap top y=40, baseline y=285
 *   "uzz"  x 235..740, x-height top y=120
 *
 * That leaves an empty band — x 235..740, y 40..120 — sitting above "uzz" and
 * level with the top of the "B". "Kannaka" is set into exactly that band, which
 * is what makes the two words read as one lockup rather than stacked captions.
 *
 * `textLength` + `lengthAdjust="spacingAndGlyphs"` pins the word to the band's
 * exact width, so the span stays true at any render size and in any font — no
 * hand-tuned letter-spacing that drifts the moment the font stack changes.
 *
 * This stays a live DOM SVG rather than a CSS `background-image` data URI on
 * purpose. An SVG referenced from CSS renders in an isolated context: it cannot
 * see page webfonts (so "Kannaka" would lose Inter) and cannot read the
 * `--kannaka-*` custom properties (so the palette would have to be hardcoded,
 * out of reach of the theme). Injected into the document, both keep working.
 */

/** Wordmark pixel geometry — see the header comment. */
const B_CENTER_X = 135;
const B_CAP_TOP_Y = 40;
const UZZ_LEFT_X = 235;
const UZZ_RIGHT_X = 740;
/** Baseline that puts the cap top of "Kannaka" level with the top of the "B". */
const WORD_BASELINE_Y = 120;
/** Inter's cap height is ~0.727em, so this fills the 80px band (110 * 0.727). */
const WORD_FONT_SIZE = 110;

/** Artwork height, and the headroom added above it so the crown is not clipped. */
export const ARTWORK_WIDTH = 777;
export const ARTWORK_HEIGHT = 326;
export const CROWN_HEADROOM = 70;
const VIEW_HEIGHT = ARTWORK_HEIGHT + CROWN_HEADROOM;

/** Class the mount looks for to stay idempotent, and that the CSS sizes. */
export const CREST_CLASS = "kannaka-crest";

export const CREST_SVG = `
<svg aria-hidden="true" class="${CREST_CLASS}" fill="none"
     viewBox="0 -${CROWN_HEADROOM} ${ARTWORK_WIDTH} ${VIEW_HEIGHT}"
     xmlns="http://www.w3.org/2000/svg">
  <title>Kannaka</title>

  <!-- Queen's crown, centred on the "B" and resting on its cap line. -->
  <g transform="translate(${B_CENTER_X} ${B_CAP_TOP_Y})">
    <!-- Points: tallest at centre, flanked by two shorter rises. -->
    <path d="M-73,-24 L-55,-58 L-32,-36 L0,-74 L32,-36 L55,-58 L73,-24 Z"
          fill="var(--kannaka-crown-gold)" stroke="var(--kannaka-crown-edge)"
          stroke-linejoin="round" stroke-width="4" />
    <!-- Band. -->
    <rect fill="var(--kannaka-crown-gold)" height="24" rx="6"
          stroke="var(--kannaka-crown-edge)" stroke-width="4"
          width="146" x="-73" y="-26" />
    <!-- Finials. -->
    <circle cx="-55" cy="-66" fill="var(--kannaka-crown-gold)" r="8" />
    <circle cx="0" cy="-82" fill="var(--kannaka-crown-gold)" r="9" />
    <circle cx="55" cy="-66" fill="var(--kannaka-crown-gold)" r="8" />
    <!-- Jewel. -->
    <circle cx="0" cy="-14" fill="var(--kannaka-crown-jewel)" r="7" />
  </g>

  <text dominant-baseline="alphabetic" fill="var(--kannaka-crest-ink)"
        font-family="'Inter Variable', Inter, 'Segoe UI', sans-serif"
        font-size="${WORD_FONT_SIZE}" font-weight="700"
        lengthAdjust="spacingAndGlyphs" textLength="${UZZ_RIGHT_X - UZZ_LEFT_X}"
        x="${UZZ_LEFT_X}" y="${WORD_BASELINE_Y}">Kannaka</text>
</svg>`.trim();
