/**
 * Step 5c: assets and links (DESIGN.md §6c).
 *
 * Images from the export become data URIs; links to files are unwrapped to
 * text with the filename; internal references become anchors when the
 * target is also selected, plain text otherwise; links back to the LMS are
 * unwrapped; other web links are kept.
 */
import type { ProcessOptions } from '../types';
import { basename, cleanText, elements, safeDecode, textOf, unwrap } from './dom';
import type { Reporter } from './report';

const FILEBASE_RE = /^(?:\$IMS[-_]CC[-_]FILEBASE\$|%24IMS[-_]CC[-_]FILEBASE%24)/i;
const WIKI_RE = /^(?:\$WIKI_REFERENCE\$|%24WIKI_REFERENCE%24)\/(?:pages|wiki)\/([^?#]+)/i;
const OBJECT_RE = /^(?:\$CANVAS_OBJECT_REFERENCE\$|%24CANVAS_OBJECT_REFERENCE%24)\/([a-z_]+)\/([^?#/]+)/i;
const COURSE_RE = /^(?:\$CANVAS_COURSE_REFERENCE\$|%24CANVAS_COURSE_REFERENCE%24)/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Canvas object types whose ids are resource ids and can be selected as sections. */
const SECTION_OBJECTS = new Set(['assignments', 'discussion_topics', 'quizzes', 'pages', 'files', 'wiki']);

export function normalizeFilebase(href: string): string {
  return href.replace(FILEBASE_RE, '$IMS-CC-FILEBASE$');
}

/**
 * Rewrite every image and link in place. Returns bytes of embedded assets.
 * `lmsHosts` are hostnames of the source LMS learned by the sanitizer (Canvas
 * data-api-* attributes); links with LMS-shaped paths teach more hosts here.
 */
export async function rewriteLinks(
  root: Element,
  opts: ProcessOptions,
  rep: Reporter,
  lmsHosts: ReadonlySet<string> = new Set(),
): Promise<number> {
  let assetBytes = 0;
  for (const img of elements(root, 'img')) {
    assetBytes += await rewriteImage(img, opts, rep);
  }
  const hosts = new Set(lmsHosts);
  for (const a of elements(root, 'a[href]')) {
    const host = lmsHostOf(a.getAttribute('href') ?? '');
    if (host) hosts.add(host);
  }
  for (const a of elements(root, 'a')) {
    if (!root.contains(a)) continue; // unwrapped by an earlier iteration
    rewriteAnchor(a, opts, rep, hosts);
  }
  return assetBytes;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function rewriteImage(img: Element, opts: ProcessOptions, rep: Reporter): Promise<number> {
  const src = (img.getAttribute('src') ?? '').trim();
  const cls = img.getAttribute('class') ?? '';

  if (/\bequation_image\b/.test(cls) || /\/equation_images\//.test(src)) {
    replaceEquation(img, src, rep);
    return 0;
  }

  const name = basename(src.replace(FILEBASE_RE, ''));
  if (name) img.setAttribute('data-sg-file', name);

  if (!src) {
    replaceMissing(img, name, 'missing-image', rep);
    rep.notice('missing-files');
    return 0;
  }
  if (/^data:image\//i.test(src)) {
    return Math.floor(((src.length - src.indexOf(',') - 1) * 3) / 4);
  }
  if (/^(?:https?:)?\/\//i.test(src)) {
    replaceMissing(img, name, 'external-image', rep);
    rep.notice('external-images');
    return 0;
  }
  if (SCHEME_RE.test(src) && !FILEBASE_RE.test(src)) {
    // data:text/*, cid:, blob:, file: … nothing we can embed
    replaceMissing(img, name, 'missing-image', rep);
    rep.notice('missing-files');
    return 0;
  }

  let asset = null;
  try {
    asset = await opts.resolveAsset(normalizeFilebase(src));
  } catch {
    asset = null;
  }
  if (asset && /^image\//i.test(asset.mime) && asset.dataUri.startsWith('data:image/')) {
    img.setAttribute('src', asset.dataUri);
    return asset.bytes;
  }
  replaceMissing(img, name, 'missing-image', rep);
  rep.notice('missing-files');
  return 0;
}

function replaceEquation(img: Element, src: string, rep: Reporter): void {
  const doc = img.ownerDocument;
  let latex = (img.getAttribute('data-equation-content') ?? '').trim();
  if (!latex) latex = (img.getAttribute('alt') ?? '').trim();
  if (!latex) {
    const m = src.match(/\/equation_images\/([^?#]+)/);
    if (m) latex = safeDecode(safeDecode(m[1]));
  }
  if (!latex) latex = 'equation';
  const code = doc.createElement('code');
  code.setAttribute('class', 'sg-equation');
  code.textContent = latex;
  img.replaceWith(code);
  rep.add('equation-image', 1, latex);
  rep.notice('equations');
}

function replaceMissing(img: Element, name: string, code: string, rep: Reporter): void {
  const doc = img.ownerDocument;
  const alt = img.getAttribute('alt');
  rep.add(code, 1, name || alt || undefined);
  if (alt !== null && cleanText(alt) === '') {
    // decorative: nothing to say in its place
    img.remove();
    return;
  }
  const span = doc.createElement('span');
  span.setAttribute('class', 'sg-missing-image');
  span.textContent = 'Image not available: ' + (cleanText(alt) || name || 'image');
  img.replaceWith(span);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

function rewriteAnchor(a: Element, opts: ProcessOptions, rep: Reporter, lmsHosts: ReadonlySet<string>): void {
  const raw = a.getAttribute('href');
  if (raw === null) return; // handled by the structure pass (unwrapped)
  const href = raw.trim();
  if (!href) return;
  if (href !== raw) a.setAttribute('href', href);

  if (FILEBASE_RE.test(href)) {
    unwrapFileLink(a, href.replace(FILEBASE_RE, ''), rep);
    return;
  }

  const wiki = href.match(WIKI_RE);
  if (wiki) {
    const key = safeDecode(wiki[1]).replace(/\/+$/, '');
    anchorOrUnwrap(a, resolveWiki(key, opts), key, opts, rep);
    return;
  }

  const obj = href.match(OBJECT_RE);
  if (obj) {
    const type = obj[1].toLowerCase();
    const id = safeDecode(obj[2]);
    if (SECTION_OBJECTS.has(type)) {
      const rid = opts.selectedSections.has(id) ? id : type === 'pages' || type === 'wiki' ? resolveWiki(id, opts) : id;
      anchorOrUnwrap(a, rid, `${type}/${id}`, opts, rep);
    } else {
      unwrap(a);
      rep.add('internal-link-unwrapped', 1, `${type}/${id}`);
    }
    return;
  }

  if (COURSE_RE.test(href)) {
    unwrap(a);
    rep.add('internal-link-unwrapped', 1, href.slice(0, 60));
    return;
  }

  if (/^https?:\/\//i.test(href)) {
    if (isLmsUrl(href, lmsHosts)) {
      unwrap(a);
      rep.add('lms-link-unwrapped', 1, hostOf(href));
    }
    return;
  }
  if (href.startsWith('//')) {
    a.setAttribute('href', 'https:' + href);
    return;
  }
  if (href.startsWith('#')) return; // fragment: structure pass repoints or unwraps
  if (href.startsWith('/')) {
    unwrap(a);
    rep.add('lms-link-unwrapped', 1, href.slice(0, 60));
    return;
  }
  if (SCHEME_RE.test(href)) {
    if (/^(?:mailto|tel|sms|ftp|ftps):/i.test(href)) return;
    unwrap(a);
    rep.add('internal-link-unwrapped', 1, href.slice(0, 60));
    return;
  }

  // Relative path inside the export.
  if (/\.html?(?:[?#]|$)/i.test(href)) {
    const slug = basename(href).replace(/\.html?$/i, '');
    const rid = resolveWiki(slug, opts) ?? resolveWiki(href.split(/[?#]/)[0], opts);
    anchorOrUnwrap(a, rid, href, opts, rep);
    return;
  }
  unwrapFileLink(a, href, rep);
}

function resolveWiki(key: string, opts: ProcessOptions): string | null {
  if (opts.selectedSections.has(key)) return key;
  const rid = opts.resolveWikiRef?.(key) ?? null;
  return rid;
}

function anchorOrUnwrap(a: Element, rid: string | null, label: string, opts: ProcessOptions, rep: Reporter): void {
  const sectionId = rid ? opts.selectedSections.get(rid) : undefined;
  if (sectionId) {
    a.setAttribute('href', '#' + sectionId);
    a.setAttribute('data-sg-anchor', '1'); // tells the structure pass this fragment is ours
    rep.add('internal-link-anchored', 1, label);
  } else {
    unwrap(a);
    rep.add('internal-link-unwrapped', 1, label);
  }
}

function unwrapFileLink(a: Element, path: string, rep: Reporter): void {
  const name = basename(path);
  const text = textOf(a).toLowerCase();
  const hasImage = a.querySelector('img') !== null;
  if (name && !hasImage && !text.includes(name.toLowerCase())) {
    a.after(a.ownerDocument.createTextNode(' (file: ' + name + ')'));
  }
  unwrap(a);
  rep.add('file-link-unwrapped', 1, name || path);
}

/**
 * Path shapes that only an LMS serves. A link like /files/123/download or
 * /api/v1/… cannot resolve outside the LMS whatever the host (institutions
 * usually run Canvas on a vanity domain such as canvas.school.edu).
 */
const LMS_PATH_RE =
  /^\/(?:courses\/\d+|files\/\d+|api\/v\d+|conversations|calendar|login|groups\/\d+|accounts\/\d+|enroll|users\/\d+)(?:[/?#]|$)/i;

/** Hostname of an http(s) link whose path is LMS-shaped, else null. */
export function lmsHostOf(href: string): string | null {
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const u = new URL(href);
    return LMS_PATH_RE.test(u.pathname) ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isLmsUrl(href: string, lmsHosts: ReadonlySet<string> = new Set()): boolean {
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (host === 'instructure.com' || host.endsWith('.instructure.com')) return true;
    if (lmsHosts.has(host)) return true;
    if (LMS_PATH_RE.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function hostOf(href: string): string {
  try {
    return new URL(href).hostname;
  } catch {
    return href;
  }
}
