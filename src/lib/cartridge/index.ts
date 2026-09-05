/**
 * Cartridge module public API. Implemented in unzip.ts / manifest.ts /
 * classify.ts / content.ts. See DESIGN.md §3–§5 and §6a.
 */
import type { AssetRef, AssignmentGroup, Cartridge, ExtractedContent, Item, Kind, Resource } from '../types';
import { KIND_LABEL } from '../types';
import { classifyStatic, enrich, isLearningApplication, readXml, type Classified } from './classify';
import { assetResolver, extract, wikiResolver } from './content';
import { parseManifest, type RawResource } from './manifest';
import { basename, safeDecode } from './paths';
import { createZipIndex, toBytes } from './unzip';
import { all, attr, childText, num } from './xml';

export type Downscaler = (bytes: Uint8Array, mime: string) => Promise<{ bytes: Uint8Array; mime: string }>;

const KIND_ORDER: Kind[] = Object.keys(KIND_LABEL) as Kind[];

/** Open an .imscc/.zip and parse it into a Cartridge. */
export async function openCartridge(data: Uint8Array | ArrayBuffer | Blob): Promise<Cartridge> {
  const bytes = await toBytes(data);
  let zip = createZipIndex(bytes);

  // Some exports nest everything in one folder; re-root the index there.
  let manifestPath = zip.resolve('imsmanifest.xml');
  if (manifestPath === null) {
    const nested = zip
      .names()
      .filter((n) => /(^|\/)imsmanifest\.xml$/i.test(n))
      .sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0];
    if (!nested) throw new Error('No imsmanifest.xml found. Is this a Common Cartridge export?');
    zip = createZipIndex(bytes, nested.slice(0, nested.length - 'imsmanifest.xml'.length));
    manifestPath = 'imsmanifest.xml';
  }

  const manifest = parseManifest(await zip.text(manifestPath));
  const settings = await readCourseSettings(zip);
  const assignmentGroups = await readAssignmentGroups(zip);
  const source: Cartridge['source'] = zip.names().some((n) => n.toLowerCase().startsWith('course_settings/'))
    ? 'canvas'
    : 'generic';

  const byId = new Map<string, RawResource>();
  for (const r of manifest.resources) byId.set(r.id, r);

  // 1. Static classification from the manifest alone.
  const classified = new Map<string, Classified>();
  for (const r of manifest.resources) classified.set(r.id, classifyStatic(r));

  // 2. Fold Canvas meta helpers (assessment_meta, topicMeta) into their owner:
  //    they never appear as rows, but their files travel with the owner.
  for (const r of manifest.resources) {
    const c = classified.get(r.id) as Classified;
    if (c.kind !== 'quiz' && c.kind !== 'discussion') continue;
    for (const depId of r.dependencies) {
      const dep = byId.get(depId);
      const dc = classified.get(depId);
      if (!dep || !dc || dc.kind !== 'other' || !isLearningApplication(dep)) continue;
      dc.hidden = true;
      for (const f of dep.files) if (!r.files.includes(f)) r.files.push(f);
    }
  }

  // 3. Titles from the organization tree (first item naming a resource wins).
  const itemTitle = new Map<string, string>();
  const walk = (items: Item[]) => {
    for (const it of items) {
      if (it.resourceId && !itemTitle.has(it.resourceId)) itemTitle.set(it.resourceId, it.title);
      walk(it.children);
    }
  };
  walk(manifest.items);

  // 4. Open each resource's own files for titles and meta.
  const enriched = await Promise.all(
    manifest.resources.map(async (r) => {
      const c = classified.get(r.id) as Classified;
      if (c.hidden) return null;
      try {
        return await enrich(zip, r, c, byId);
      } catch {
        return { kind: c.kind, hidden: false, meta: {} };
      }
    }),
  );

  const resources = new Map<string, Resource>();
  manifest.resources.forEach((r, i) => {
    const e = enriched[i];
    if (!e || e.hidden) return;
    const meta = e.meta;
    if (r.intendedRole) meta.intendedRole = r.intendedRole;
    const fallback = r.href ? safeDecode(basename(r.href)) : r.id;
    const res: Resource = {
      id: r.id,
      type: r.type,
      files: r.files,
      dependencies: r.dependencies,
      kind: e.kind,
      title: itemTitle.get(r.id) ?? e.fileTitle ?? fallback,
      meta,
    };
    if (r.href) res.href = r.href;
    resources.set(r.id, res);
  });

  // 5. Items pointing at hidden or missing resources become plain header rows.
  const prune = (items: Item[]) => {
    for (const it of items) {
      if (it.resourceId !== undefined && !resources.has(it.resourceId)) delete it.resourceId;
      prune(it.children);
    }
  };
  prune(manifest.items);

  // 6. Unfiled: not referenced by any item, sorted by kind then title.
  const unfiled = Array.from(resources.values())
    .filter((r) => !itemTitle.has(r.id))
    .sort((a, b) => {
      const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
      if (k !== 0) return k;
      const ta = a.title.toLowerCase();
      const tb = b.title.toLowerCase();
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((r) => r.id);

  const cart: Cartridge = {
    title: settings.title ?? manifest.title ?? 'Untitled course',
    version: manifest.version,
    source,
    items: manifest.items,
    resources,
    unfiled,
    assignmentGroups,
    zip,
  };
  if (settings.courseCode) cart.courseCode = settings.courseCode;
  if (settings.term) cart.term = settings.term;
  if (settings.startAt) cart.startAt = settings.startAt;
  if (settings.endAt) cart.endAt = settings.endAt;
  const language = settings.language ?? manifest.language;
  if (language) cart.language = language;
  return cart;
}

interface CourseSettings {
  title?: string;
  courseCode?: string;
  term?: string;
  startAt?: string;
  endAt?: string;
  language?: string;
}

async function readCourseSettings(zip: Cartridge['zip']): Promise<CourseSettings> {
  const doc = await readXml(zip, 'course_settings/course_settings.xml');
  const out: CourseSettings = {};
  if (!doc) return out;
  const root = doc.documentElement;
  const title = childText(root, 'title');
  if (title) out.title = title;
  const code = childText(root, 'course_code');
  if (code) out.courseCode = code;
  const term = childText(root, 'term_name') ?? childText(root, 'term');
  if (term) out.term = term;
  const start = childText(root, 'start_at');
  if (start) out.startAt = start;
  const end = childText(root, 'conclude_at') ?? childText(root, 'end_at');
  if (end) out.endAt = end;
  const locale = childText(root, 'locale');
  if (locale) out.language = locale;
  return out;
}

async function readAssignmentGroups(zip: Cartridge['zip']): Promise<AssignmentGroup[]> {
  const doc = await readXml(zip, 'course_settings/assignment_groups.xml');
  if (!doc) return [];
  const groups = all(doc, 'assignmentGroup').map((el, i) => {
    const g: AssignmentGroup = { id: attr(el, 'identifier') ?? `group-${i + 1}`, title: childText(el, 'title') ?? 'Untitled' };
    const weight = num(childText(el, 'group_weight'));
    if (weight !== undefined) g.weight = weight;
    return { g, position: num(childText(el, 'position')) ?? i, i };
  });
  groups.sort((a, b) => a.position - b.position || a.i - b.i);
  return groups.map((x) => x.g);
}

/** Extract the raw HTML body (per kind rule) for one resource. */
export async function extractContent(cart: Cartridge, resourceId: string): Promise<ExtractedContent> {
  return extract(cart, resourceId);
}

/**
 * Build a resolver from cartridge hrefs ($IMS-CC-FILEBASE$/..., relative
 * paths) to embedded data-URI assets. Results are memoised per href.
 */
export function makeAssetResolver(
  cart: Cartridge,
  opts?: { downscale?: Downscaler },
): (href: string) => Promise<AssetRef | null> {
  return assetResolver(cart, opts);
}

/** Build a resolver from $WIKI_REFERENCE$/pages/<slug-or-id> to a resource id. */
export function makeWikiResolver(cart: Cartridge): (ref: string) => string | null {
  return wikiResolver(cart);
}
