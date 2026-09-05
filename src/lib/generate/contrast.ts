/**
 * WCAG 2.x colour arithmetic on "#rrggbb" strings. Pure, no DOM.
 *
 * Used by the Styled theme to derive one softened gridline colour from a
 * palette's secondary without dropping under the 3:1 boundary minimum, and
 * exported so the app can verify swatches with the same numbers the tests use.
 */

const HEX = /^#?([0-9a-f]{6})$/i;

/** [r, g, b] in 0–255, or throws for anything that is not a six-digit hex colour. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = HEX.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const h = m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Lower-case "#rrggbb" from 0–255 channels (clamped and rounded). */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Linear sRGB-space mix: `share` is how much of `into` to blend in
 * (0 → `from` unchanged, 1 → `into`). Deterministic and rounded to a hex.
 */
export function mixHex(from: string, into: string, share: number): string {
  const t = Math.max(0, Math.min(1, share));
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(into);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
