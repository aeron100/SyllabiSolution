/**
 * Small pure helpers for the UI: byte formatting, filenames, language tags,
 * browser detection, HTML escaping. No DOM access except where a
 * navigator is passed in explicitly, so everything here is unit-testable.
 */

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Whole megabytes, for the "This file is large (38 MB)" notice. */
export function megabytes(n: number): number {
  return Math.max(1, Math.round(n / (1024 * 1024)));
}

export function slugify(s: string): string {
  const out = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || 'course';
}

function baseName(courseCode: string | undefined, title: string): string {
  const code = courseCode?.trim();
  return slugify(code && code.length > 0 ? code : title);
}

/** DESIGN.md §7: "<course-code>-syllabus.html" (falls back to the title). */
export function syllabusFilename(courseCode: string | undefined, title: string): string {
  return `${baseName(courseCode, title)}-syllabus.html`;
}

export function reportFilename(courseCode: string | undefined, title: string): string {
  return `${baseName(courseCode, title)}-accessibility-report.txt`;
}

/** "en-US" -> "en". Empty or missing -> "en". */
export function primaryLanguage(tag: string | undefined | null): string {
  const t = (tag ?? '').trim();
  if (!t) return 'en';
  const primary = t.split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'en';
}

/**
 * Chromium detection for the print notice (DESIGN.md §14). Prefers the
 * User-Agent Client Hints brands when present, else a UA regex.
 */
export function isChromiumBrowser(userAgent: string, brands?: ReadonlyArray<{ brand: string }>): boolean {
  if (brands && brands.length > 0) {
    return brands.some((b) => /chromium|google chrome|microsoft edge/i.test(b.brand));
  }
  if (/firefox\/|fxios\//i.test(userAgent)) return false;
  if (/edg\/|edga\/|edgios\//i.test(userAgent)) return true;
  if (/chrome\/|crios\/|chromium\//i.test(userAgent)) return true;
  return false;
}

interface NavigatorWithUAData extends Navigator {
  userAgentData?: { brands?: { brand: string; version: string }[] };
}

export function currentBrowserIsChromium(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as NavigatorWithUAData;
  return isChromiumBrowser(nav.userAgent, nav.userAgentData?.brands);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turn any thrown value into one plain sentence for the user. */
export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}

/** True when the filename looks like a course export we accept. */
export function isCartridgeFilename(name: string): boolean {
  return /\.(imscc|zip)$/i.test(name);
}
