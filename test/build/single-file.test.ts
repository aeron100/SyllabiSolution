/**
 * One build, one artifact (DESIGN.md §2 "One artifact"): dist/index.html must
 * be fully self-contained so the same file works hosted on any static server
 * and opened from disk via file://, where a browser blocks fetch() and often
 * refuses sibling files. So nothing in the file — markup, CSS, or the JS
 * bundle — may start a network or file request: every url() and src is a
 * data: URI, and the bundle carries no fetch, XHR, beacon, socket, worker,
 * dynamic import, or dev-only ?load= path. The course export is read through
 * the File API only.
 *
 * Skips (does not fail) when the build output is missing: run `npm run build`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIST = resolve(ROOT, 'dist', 'index.html');
const present = existsSync(DIST);

/** Font families that must ship inside the file as WOFF2 data URIs. */
const FONTS = ['Fraunces', 'Inter', 'bootstrap-icons'] as const;

/** Absolute URL literals allowed to appear anywhere in the file. None is ever requested. */
const ALLOWED_ABSOLUTE = [
  /^https?:\/\/www\.w3\.org\//, // XML namespaces (svg, xhtml, xlink, mathml, xml)
  /^https:\/\/www\.coastline\.edu\/?$/, // header logo link (user-initiated, target=_blank)
  /^https:\/\/www\.youtube\.com\/(watch|playlist)(\?list=)?$/, // URL *parsing* of cartridge links, never fetched
  /^https:\/\/reactjs\.org\/docs\/error-decoder\.html/, // React error message text
  /^https:\/\/(getbootstrap\.com|icons\.getbootstrap\.com|github\.com\/twbs)\//, // license comments
];

/**
 * Substrings that would mean the bundle can load something at runtime. The
 * DEV-only ?load= aid (the code base's one fetch) must be compiled out.
 */
const REQUEST_NEEDLES = [
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'EventSource(',
  'WebSocket(',
  'new Worker(',
  'SharedWorker(',
  'import(',
  'import.meta',
  'modulepreload',
  'sourceMappingURL',
  'get("load")',
  '/assets/',
] as const;

/** Every url(...) argument in a CSS text, unquoted and trimmed. */
function cssUrls(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  return out;
}

describe.skipIf(!present)('dist/index.html is a single self-contained file', () => {
  const html = present ? readFileSync(DIST, 'utf8') : '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script'));
  const js = scripts.map((s) => s.textContent ?? '').join('\n');
  const styleText = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');
  const inlineStyleText = Array.from(doc.querySelectorAll<HTMLElement>('[style]'))
    .map((el) => el.getAttribute('style') ?? '')
    .join('\n');

  it('loads no external script and has one inline module bundle', () => {
    expect(scripts.filter((s) => s.hasAttribute('src')).map((s) => s.getAttribute('src'))).toEqual([]);
    expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
    const modules = scripts.filter((s) => s.getAttribute('type') === 'module' && !s.hasAttribute('src'));
    expect(modules.length).toBeGreaterThanOrEqual(1);
    expect(modules.filter((s) => (s.textContent ?? '').length > 10_000).length).toBe(1);
  });

  it('has no <link>, <base>, or @import at all', () => {
    expect(doc.querySelectorAll('link').length).toBe(0);
    expect(doc.querySelectorAll('base').length).toBe(0);
    expect(html).not.toMatch(/<link[^>]+rel=["']?(stylesheet|preload|modulepreload|icon|prefetch)/i);
    expect(styleText).not.toMatch(/@import\b/);
  });

  it('no static element outside <script> has a non-data: src, href, srcset, poster, data, action, or manifest', () => {
    const attrs = ['src', 'href', 'srcset', 'poster', 'data', 'action', 'manifest'];
    const bad: string[] = [];
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      if (el.tagName === 'SCRIPT') continue;
      for (const a of attrs) {
        const v = el.getAttribute(a);
        if (v !== null && !/^data:/i.test(v) && !/^#/.test(v)) bad.push(`<${el.tagName.toLowerCase()} ${a}="${v.slice(0, 60)}">`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('every url() in CSS is a data: URI or a same-document fragment (fonts, icons, images)', () => {
    const urls = cssUrls(styleText + '\n' + inlineStyleText);
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.filter((u) => !/^data:/i.test(u) && !/^#/.test(u))).toEqual([]);
  });

  it('every @font-face is an inline WOFF2 data URI', () => {
    const faces = styleText.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) expect(f).toMatch(/src:\s*url\(\s*["']?data:font\/woff2;base64,/);
  });

  it.each(FONTS)('ships %s as an inline font/woff2 data URI', (family) => {
    const faces = styleText.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const ours = faces.filter((f) => new RegExp(`font-family:\\s*["']?${family}`, 'i').test(f));
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.some((f) => /url\(\s*["']?data:font\/woff2;base64,/i.test(f))).toBe(true);
  });

  it('the bundle cannot start a request: no fetch, XHR, beacon, socket, worker, dynamic import, or ?load= path', () => {
    // .includes() rather than toContain() so a failure does not print the 1.5 MB file.
    for (const needle of REQUEST_NEEDLES) expect(js.includes(needle), `bundle contains ${needle}`).toBe(false);
    expect(js).not.toMatch(/\bfetch\s*\(/);
    expect(js).not.toMatch(/\bimport\s+[\w{*"']/); // no static import statement survives
  });

  it('nothing in the bundle builds a URL from location, baseURI, or import.meta to load an asset', () => {
    // A path resolved at runtime (new URL('x', import.meta.url), baseURI + ...) would break on file://.
    expect(js).not.toMatch(/new URL\([^)]*(import\.meta|baseURI|location\.href|document\.URL)/);
    expect(js).not.toMatch(/location\.origin\s*\+/);
  });

  it('every absolute URL literal in the file is on the harmless allowlist', () => {
    const found = Array.from(new Set(html.match(/https?:\/\/[A-Za-z0-9./_\-?=&%#]+/g) ?? []));
    const rogue = found.filter((u) => !ALLOWED_ABSOLUTE.some((re) => re.test(u)));
    expect(rogue).toEqual([]);
  });

  it('embeds the Coastline logo SVG source (LOGO_DATA_URI is built from it at runtime), never a file path', () => {
    const svg = readFileSync(resolve(ROOT, 'src/assets/coastline-logo.svg'), 'utf8');
    // A quote-free chunk of the first path so the JS string's quoting style does not matter.
    const chunk = svg.match(/ d="([^"\n]{40,})/)?.[1].slice(0, 40);
    expect(chunk).toBeTruthy();
    expect(js.includes(chunk ?? '')).toBe(true);
    expect(js.includes('SVGID_1_')).toBe(true);
    expect(html).not.toMatch(/src=["'][^"']*\.(svg|png)["']/);
  });

  it('references none of the old public/ assets', () => {
    for (const name of ['coastline-logo.svg', 'coastline-logo.png', 'sample.imscc']) {
      expect(html.includes(name), `dist/index.html mentions ${name}`).toBe(false);
    }
  });

  it('is reasonably small (under 4 MB) and reports its size', () => {
    const bytes = statSync(DIST).size;
    // eslint-disable-next-line no-console
    console.info(`dist/index.html: ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });
});
