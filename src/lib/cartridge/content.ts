/**
 * Per-kind content extraction (DESIGN.md §6a) and the asset / wiki
 * resolvers. Output here is raw HTML that the process module will
 * sanitize; nothing is trusted yet.
 */
import type { AssetRef, Cartridge, ExtractedContent, Resource, ResourceMeta, ZipIndex } from '../types';
import type { Downscaler } from './index';
import { readXml } from './classify';
import {
  dueLabel,
  escapeHtml,
  ianaZone,
  joinHtml,
  metaLine,
  pointsLabel,
  questionsLabel,
  toBase64,
  type DueHints,
} from './format';
import { isHtmlPath, isImageMime, mimeFor } from './mime';
import {
  basename,
  encodePath,
  isAbsoluteUrl,
  safeDecode,
  slugify,
  stripFileBase,
  stripQuery,
  stripWikiRef,
} from './paths';
import { readText } from './unzip';
import { child, childText, firstText } from './xml';

const WEB_RESOURCES = 'web_resources/';

/**
 * Course time zone, inferred from the time_zone_edited values Canvas writes
 * into assignment/discussion/quiz settings (most common wins; ties go to the
 * first in manifest order). Memoised per cartridge. Undefined for exports
 * that carry no zone, in which case dates render as UTC calendar dates.
 */
const zoneCache = new WeakMap<Cartridge, Promise<string | undefined>>();

function courseTimeZone(cart: Cartridge): Promise<string | undefined> {
  let p = zoneCache.get(cart);
  if (!p) {
    p = detectCourseZone(cart);
    zoneCache.set(cart, p);
  }
  return p;
}

async function detectCourseZone(cart: Cartridge): Promise<string | undefined> {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const r of cart.resources.values()) {
    let path: string | undefined;
    if (r.kind === 'assignment' || r.kind === 'quiz') {
      path = r.files.find((f) => /(assignment_settings|assessment_meta)\.xml$/i.test(f));
    } else if (r.kind === 'discussion' || r.kind === 'announcement') {
      const topic = r.href ?? r.files[0];
      path = r.files.find((f) => f !== topic);
    }
    if (!path) continue;
    const doc = await readXml(cart.zip, path);
    const zone = doc ? ianaZone(firstText(doc, 'time_zone_edited')) : undefined;
    if (!zone) continue;
    if (!counts.has(zone)) order.push(zone);
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const zone of order) {
    const n = counts.get(zone) ?? 0;
    if (n > bestCount) {
      best = zone;
      bestCount = n;
    }
  }
  return best;
}

/** Fill in the course zone when the element carried none of its own. */
async function withCourseZone(cart: Cartridge, hints: DueHints): Promise<DueHints> {
  if (hints.timeZone || hints.allDayDate) return hints;
  const zone = await courseTimeZone(cart);
  return zone ? { ...hints, timeZone: zone } : hints;
}

/** Strip the Canvas <html><head>…</head><body> wrapper; keep body children. */
export function unwrapBody(html: string): string {
  const src = html.charCodeAt(0) === 0xfeff ? html.slice(1) : html;
  const body = /<body[^>]*>([\s\S]*?)<\/body\s*>/i.exec(src);
  if (body) return body[1].trim();
  return src
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/i, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '')
    .trim();
}

/** all_day_date / time zone hints from a Canvas assignment-like element. */
function hintsFrom(el: Element | null): DueHints {
  const hints: DueHints = {};
  if (!el) return hints;
  const allDay = childText(el, 'all_day');
  const allDayDate = childText(el, 'all_day_date');
  if (allDayDate && (allDay === undefined || allDay === 'true')) hints.allDayDate = allDayDate;
  const zone = ianaZone(childText(el, 'time_zone_edited'));
  if (zone) hints.timeZone = zone;
  return hints;
}

/** Hints from the root element, falling back to its nested <assignment>. */
function hintsFromRoot(doc: Document | null): DueHints {
  if (!doc) return {};
  const root = doc.documentElement;
  const own = hintsFrom(root);
  if (own.allDayDate || own.timeZone) return own;
  return hintsFrom(child(root, 'assignment'));
}

async function extractPage(zip: ZipIndex, r: Resource): Promise<string | null> {
  const path = r.href ?? r.files.find(isHtmlPath) ?? r.files[0];
  const html = await readText(zip, path);
  return html === null ? null : unwrapBody(html);
}

async function extractAssignment(cart: Cartridge, r: Resource, meta: ResourceMeta): Promise<string | null> {
  const zip = cart.zip;
  const htmlPath = r.href && isHtmlPath(r.href) ? r.href : r.files.find(isHtmlPath);
  const raw = await readText(zip, htmlPath);
  let description = raw === null ? null : unwrapBody(raw);
  if (description === null) {
    // CC 1.3 assignment extension keeps the body in <assignment><text>.
    const xmlPath = r.href && /\.xml$/i.test(r.href) ? r.href : r.files.find((f) => /\.xml$/i.test(f) && !/assignment_settings\.xml$/i.test(f));
    const doc = await readXml(zip, xmlPath);
    const text = doc ? childText(doc.documentElement, 'text') : undefined;
    if (text !== undefined) description = text;
  }
  if (description === null) return null;
  const settings = r.files.find((f) => f.toLowerCase().endsWith('assignment_settings.xml'));
  const hints = await withCourseZone(cart, hintsFromRoot(await readXml(zip, settings)));
  return joinHtml(description, metaLine([pointsLabel(meta.points), dueLabel(meta.dueAt, hints)]));
}

async function extractTopic(cart: Cartridge, r: Resource, meta: ResourceMeta): Promise<string | null> {
  const zip = cart.zip;
  const topicPath = r.href ?? r.files[0];
  const doc = await readXml(zip, topicPath);
  if (!doc) return null;
  const text = childText(doc.documentElement, 'text') ?? '';
  let hints: DueHints = {};
  for (const f of r.files) {
    if (f === topicPath) continue;
    const m = await readXml(zip, f);
    if (m && m.documentElement.localName === 'topicMeta') {
      hints = hintsFrom(child(m.documentElement, 'assignment'));
      break;
    }
  }
  if (meta.dueAt) hints = await withCourseZone(cart, hints);
  return joinHtml(text, metaLine([pointsLabel(meta.points), dueLabel(meta.dueAt, hints)]));
}

async function extractQuiz(cart: Cartridge, r: Resource, meta: ResourceMeta): Promise<string> {
  const metaPath = r.files.find((f) => f.toLowerCase().endsWith('assessment_meta.xml'));
  let hints = hintsFromRoot(await readXml(cart.zip, metaPath));
  if (meta.dueAt) hints = await withCourseZone(cart, hints);
  const summary = metaLine([questionsLabel(meta.questionCount), pointsLabel(meta.points), dueLabel(meta.dueAt, hints)]);
  return joinHtml(meta.description ?? '', summary);
}

function extractLink(r: Resource, meta: ResourceMeta): string {
  const title = escapeHtml(r.title);
  const head = meta.url ? `<p><a href="${escapeHtml(meta.url)}">${title}</a></p>` : `<p>${title}</p>`;
  return joinHtml(head, meta.description ?? '');
}

/** Title and description only (DESIGN.md §3); the assembler renders the title as the heading. */
function extractTool(_r: Resource, meta: ResourceMeta): string {
  return meta.description ?? '';
}

function extractFile(zip: ZipIndex, r: Resource, meta: ResourceMeta): string | null {
  const href = r.href ?? r.files[0];
  if (!href || zip.resolve(href) === null) return null;
  const mime = meta.mime ?? mimeFor(href);
  const filename = meta.filename ?? safeDecode(basename(href));
  if (isImageMime(mime)) {
    const decoded = safeDecode(stripQuery(href)).replace(/^(\.\/|\/)+/, '');
    const rel = decoded.toLowerCase().startsWith(WEB_RESOURCES) ? decoded.slice(WEB_RESOURCES.length) : decoded;
    const src = `$IMS-CC-FILEBASE$/${encodePath(rel)}`;
    // The title is the best description we have; the structure pass clears it
    // and asks for a real one when it is only a filename.
    const title = escapeHtml(r.title);
    return `<figure><img src="${escapeHtml(src)}" alt="${title}"><figcaption>${title}</figcaption></figure>`;
  }
  // Title line with the filename: the title is already the section heading,
  // so only the filename is added, and only when it says something new.
  return r.title === filename ? '' : `<p>File: ${escapeHtml(filename)}</p>`;
}

/** Extract the raw HTML body for one resource. Never throws for a missing file. */
export async function extract(cart: Cartridge, resourceId: string): Promise<ExtractedContent> {
  const r = cart.resources.get(resourceId);
  if (!r) throw new Error(`Unknown resource: ${resourceId}`);
  const meta: ResourceMeta = { ...r.meta };
  let html: string | null = '';
  try {
    switch (r.kind) {
      case 'page':
      case 'syllabus':
        html = await extractPage(cart.zip, r);
        break;
      case 'assignment':
        html = await extractAssignment(cart, r, meta);
        break;
      case 'discussion':
      case 'announcement':
        html = await extractTopic(cart, r, meta);
        break;
      case 'quiz':
        html = await extractQuiz(cart, r, meta);
        break;
      case 'link':
        html = extractLink(r, meta);
        break;
      case 'tool':
        html = extractTool(r, meta);
        break;
      case 'file':
        html = extractFile(cart.zip, r, meta);
        break;
      case 'other':
        html = '';
        break;
    }
  } catch {
    html = null;
  }
  if (html === null) {
    html = '';
    delete meta.description;
  }
  return { resourceId, kind: r.kind, title: r.title, html, meta };
}

// ---------------------------------------------------------------------------
// Asset resolver
// ---------------------------------------------------------------------------

/** Map an href from page content to a zip entry name, or null. */
export function resolveAssetEntry(zip: ZipIndex, href: string): string | null {
  const h = href.trim();
  if (h === '' || h.startsWith('#')) return null;
  const rest = stripFileBase(h);
  if (rest !== null) return zip.resolve(WEB_RESOURCES + rest) ?? zip.resolve(rest);
  if (isAbsoluteUrl(h)) return null;
  return zip.resolve(WEB_RESOURCES + h) ?? zip.resolve(h);
}

export function assetResolver(
  cart: Cartridge,
  opts?: { downscale?: Downscaler },
): (href: string) => Promise<AssetRef | null> {
  const downscale = opts?.downscale;
  const byHref = new Map<string, Promise<AssetRef | null>>();
  const byEntry = new Map<string, Promise<AssetRef | null>>();

  const load = async (entry: string): Promise<AssetRef | null> => {
    let bytes: Uint8Array;
    try {
      bytes = await cart.zip.bytes(entry);
    } catch {
      return null;
    }
    let mime = mimeFor(entry);
    if (downscale && isImageMime(mime)) {
      try {
        const scaled = await downscale(bytes, mime);
        bytes = scaled.bytes;
        mime = scaled.mime;
      } catch {
        /* keep the original bytes */
      }
    }
    return { dataUri: `data:${mime};base64,${toBase64(bytes)}`, bytes: bytes.length, mime };
  };

  return (href: string) => {
    const cached = byHref.get(href);
    if (cached) return cached;
    const entry = resolveAssetEntry(cart.zip, href);
    let p: Promise<AssetRef | null>;
    if (entry === null) {
      p = Promise.resolve(null);
    } else {
      let e = byEntry.get(entry);
      if (!e) {
        e = load(entry);
        byEntry.set(entry, e);
      }
      p = e;
    }
    byHref.set(href, p);
    return p;
  };
}

// ---------------------------------------------------------------------------
// Wiki resolver
// ---------------------------------------------------------------------------

export function wikiResolver(cart: Cartridge): (ref: string) => string | null {
  const ids = new Set<string>();
  const bySlug = new Map<string, string>();
  const byTitle = new Map<string, string>();
  const put = (map: Map<string, string>, key: string, id: string) => {
    if (key !== '' && !map.has(key)) map.set(key, id);
  };
  for (const r of cart.resources.values()) {
    ids.add(r.id);
    if (r.kind !== 'page' && r.kind !== 'syllabus') continue;
    const href = r.href ?? r.files[0];
    if (href) {
      const file = safeDecode(basename(href));
      put(bySlug, file.replace(/\.[a-z0-9]+$/i, '').toLowerCase(), r.id);
    }
    put(byTitle, slugify(r.title), r.id);
  }
  return (ref: string) => {
    let x = stripWikiRef(ref) ?? ref;
    x = safeDecode(stripQuery(x)).trim().replace(/\/+$/, '');
    if (x === '') return null;
    if (ids.has(x)) return x;
    const lower = x.toLowerCase();
    const slug = slugify(x);
    return bySlug.get(lower) ?? bySlug.get(slug) ?? byTitle.get(slug) ?? null;
  };
}

