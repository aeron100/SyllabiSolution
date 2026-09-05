/**
 * Path helpers: query stripping, URL decoding, normalisation, and the
 * Canvas placeholder prefixes ($IMS-CC-FILEBASE$, $WIKI_REFERENCE$).
 * Pure functions, no I/O.
 */

const FILEBASE_RE = /^(?:\$IMS[-_]CC[-_]FILEBASE\$|%24IMS[-_]CC[-_]FILEBASE%24)\/?/i;
const WIKI_RE = /^(?:\$WIKI_REFERENCE\$|%24WIKI_REFERENCE%24)\/pages\/?/i;

/** Remove a trailing "?query" and/or "#fragment". */
export function stripQuery(p: string): string {
  const i = p.search(/[?#]/);
  return i >= 0 ? p.slice(0, i) : p;
}

/** decodeURIComponent that never throws (malformed input is returned as-is). */
export function safeDecode(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Collapse "." and ".." segments, duplicate slashes, and a leading "/" or "./". */
export function collapse(p: string): string {
  const out: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

/** Normalise a lookup path: trim, strip query, decode, collapse. */
export function normalizePath(p: string): string {
  return collapse(safeDecode(stripQuery(p.trim())));
}

/** Case- and Unicode-normalisation-insensitive key for matching entry names. */
export function foldKey(p: string): string {
  return p.normalize('NFC').toLowerCase();
}

/** If href starts with a $IMS-CC-FILEBASE$ placeholder (any variant), return the remainder. */
export function stripFileBase(href: string): string | null {
  const h = href.trim();
  const m = FILEBASE_RE.exec(h);
  return m ? h.slice(m[0].length) : null;
}

/** If href starts with $WIKI_REFERENCE$/pages/, return the remainder. */
export function stripWikiRef(href: string): string | null {
  const h = href.trim();
  const m = WIKI_RE.exec(h);
  return m ? h.slice(m[0].length) : null;
}

/** True for scheme-qualified or protocol-relative URLs (http:, data:, mailto:, //…). */
export function isAbsoluteUrl(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href.trim());
}

/** Last path segment, query stripped. */
export function basename(p: string): string {
  const s = stripQuery(p.trim()).replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Lower-cased extension without the dot, or "" when there is none. */
export function extension(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}

/** Percent-encode each path segment (spaces become %20, "/" is kept). */
export function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

/** Slug in the style Canvas uses for page URLs: lowercase, "&" → "and", non-alphanumerics → "-". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
