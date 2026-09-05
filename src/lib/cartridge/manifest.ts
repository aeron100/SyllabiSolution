/**
 * imsmanifest.xml parser. Namespace-agnostic (localName matching) so it
 * reads Canvas CC 1.0–1.3 as well as Moodle/Blackboard/D2L/Schoology
 * exports. Produces the organization tree and the raw resource list;
 * classification happens in classify.ts.
 */
import type { Item } from '../types';
import { all, attr, child, children, childText, first, parseXml } from './xml';

export interface RawResource {
  id: string;
  type: string;
  href?: string;
  files: string[];
  dependencies: string[];
  intendedUse?: string;
  intendedRole?: string;
}

export interface ParsedManifest {
  version: string;
  title?: string;
  language?: string;
  items: Item[];
  resources: RawResource[];
}

export function parseManifest(text: string): ParsedManifest {
  const doc = parseXml(text);
  if (!doc) throw new Error('imsmanifest.xml is not well-formed XML.');
  const root = doc.documentElement;
  const out: ParsedManifest = {
    version: detectVersion(root),
    items: parseOrganizations(root),
    resources: parseResources(root),
  };
  const title = manifestTitle(root);
  if (title) out.title = title;
  const language = manifestLanguage(root);
  if (language) out.language = language;
  return out;
}

function detectVersion(root: Element): string {
  const meta = child(root, 'metadata');
  const sv = meta ? first(meta, 'schemaversion') : first(root, 'schemaversion');
  const v = sv?.textContent?.trim();
  if (v) return v;
  const ns = root.namespaceURI ?? '';
  const m = /imsccv1p(\d)/i.exec(ns);
  if (m) return `1.${m[1]}.0`;
  return /imscc/i.test(ns) ? '1.0.0' : 'unknown';
}

/** LOM wraps strings in <string> (CC) or <langstring> (LOM 1.0). */
function lomText(el: Element | null): string | undefined {
  if (!el) return undefined;
  const inner = child(el, 'string') ?? child(el, 'langstring');
  const t = (inner ?? el).textContent?.trim();
  return t ? t : undefined;
}

function manifestTitle(root: Element): string | undefined {
  const meta = child(root, 'metadata');
  if (!meta) return undefined;
  for (const general of all(meta, 'general')) {
    const t = lomText(child(general, 'title'));
    if (t) return t;
  }
  return lomText(first(meta, 'title'));
}

function manifestLanguage(root: Element): string | undefined {
  const meta = child(root, 'metadata');
  if (!meta) return undefined;
  for (const general of all(meta, 'general')) {
    const l = childText(general, 'language');
    if (l) return l;
  }
  return undefined;
}

function parseOrganizations(root: Element): Item[] {
  const orgs = child(root, 'organizations');
  if (!orgs) return [];
  let top: Element[] = [];
  for (const org of children(orgs, 'organization')) top.push(...children(org, 'item'));
  if (top.length === 0) top = children(orgs, 'item');

  // Canvas wraps every module in one synthetic root item ("LearningModules").
  // Unwrap a single untitled/synthetic root so its children become the modules.
  if (top.length === 1) {
    const only = top[0];
    const untitled = !childText(only, 'title');
    const synthetic = (attr(only, 'identifier') ?? '').toLowerCase() === 'learningmodules';
    if (!attr(only, 'identifierref') && (untitled || synthetic) && children(only, 'item').length > 0) {
      top = children(only, 'item');
    }
  }

  const seen = new Map<string, number>();
  return top.map((el) => toItem(el, seen));
}

function toItem(el: Element, seen: Map<string, number>): Item {
  let id = attr(el, 'identifier') ?? 'item';
  const n = seen.get(id) ?? 0;
  seen.set(id, n + 1);
  if (n > 0) id = `${id}-${n + 1}`;
  const item: Item = {
    id,
    title: childText(el, 'title') ?? 'Untitled',
    children: children(el, 'item').map((c) => toItem(c, seen)),
  };
  const ref = attr(el, 'identifierref');
  if (ref) item.resourceId = ref;
  return item;
}

function parseResources(root: Element): RawResource[] {
  const container = child(root, 'resources');
  const list = container ? children(container, 'resource') : all(root, 'resource');
  return list.map((el, i) => {
    const files = children(el, 'file')
      .map((f) => attr(f, 'href'))
      .filter((h): h is string => h !== undefined);
    const dependencies = children(el, 'dependency')
      .map((d) => attr(d, 'identifierref'))
      .filter((h): h is string => h !== undefined);
    const r: RawResource = {
      id: attr(el, 'identifier') ?? `resource-${i + 1}`,
      type: attr(el, 'type') ?? '',
      files,
      dependencies,
    };
    const href = attr(el, 'href');
    if (href) r.href = href;
    const use = attr(el, 'intendeduse');
    if (use) r.intendedUse = use;
    const meta = child(el, 'metadata');
    const roleEl = meta ? first(meta, 'intendedEndUserRole') : null;
    const role = roleEl ? childText(roleEl, 'value') : undefined;
    if (role) r.intendedRole = role;
    return r;
  });
}
