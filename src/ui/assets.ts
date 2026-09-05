/**
 * Build-time assets, inlined so the app makes no request of its own
 * (DESIGN.md §2 "One artifact"): the same dist/index.html works hosted on
 * any static server and opened from disk via file://, where fetch() of a
 * sibling file is blocked by browsers.
 */
import logoSvg from '../assets/coastline-logo.svg?raw';

/** Base64 of a UTF-8 string. btoa exists in browsers, jsdom and Node ≥ 16, but only takes Latin-1, so encode first. */
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** The Coastline College mark as a data URI: the header image and, embedded, the cover logo. */
export const LOGO_DATA_URI = `data:image/svg+xml;base64,${base64Utf8(logoSvg)}`;
