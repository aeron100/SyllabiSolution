/**
 * Small pure text helpers used by the assembler. No DOM, no I/O.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for use in HTML text nodes or double/single-quoted attributes. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * UTF-8 byte length of a string without allocating an encoded copy.
 * Lone surrogates count as 3 bytes, matching TextEncoder (U+FFFD).
 */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else {
        n += 3;
      }
    } else n += 3;
  }
  return n;
}

/** Loose BCP-47 shape check: "en", "en-US", "zh-Hant-TW", "es-419". */
export function isLanguageTag(s: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(s);
}

/** Good enough to decide whether a cover email deserves a mailto: link. */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/.test(s);
}

/** Collapse whitespace and trim; empty string when nothing is left. */
export function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}
