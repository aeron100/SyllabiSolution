/**
 * Resource classification (DESIGN.md §3) and per-kind metadata enrichment.
 * classifyStatic() decides a kind from the manifest alone; enrich() then
 * opens the resource's own files to fill titles and ResourceMeta.
 */
import type { Kind, ResourceMeta, ZipIndex } from '../types';
import type { RawResource } from './manifest';
import { escapeHtml } from './format';
import { isHtmlPath, mimeFor } from './mime';
import { basename, safeDecode } from './paths';
import { readText } from './unzip';
import { all, attr, child, childText, first, firstText, num, parseHtml, parseXml } from './xml';

export interface Classified {
  kind: Kind;
  /** True for Canvas meta helpers (assessment_meta, topicMeta) folded into their owner. */
  hidden: boolean;
}

export interface Enriched extends Classified {
  /** Title found inside the resource's own file, used when no item names it. */
  fileTitle?: string;
  meta: ResourceMeta;
}

export function isLearningApplication(r: RawResource | undefined): boolean {
  const t = (r?.type ?? '').toLowerCase();
  return t.includes('learning-application-resource') || t.includes('associatedcontent');
}

export function classifyStatic(r: RawResource): Classified {
  const t = r.type.toLowerCase();
  const href = (r.href ?? r.files[0] ?? '').toLowerCase();
  const files = r.files.map((f) => f.toLowerCase());
  const use = (r.intendedUse ?? '').toLowerCase();
  const ok = (kind: Kind, hidden = false): Classified => ({ kind, hidden });

  if (t.includes('basiclti')) return ok('tool');
  if (t.includes('imswl')) return ok('link');
  if (t.includes('imsdt')) return ok('discussion');
  if (t.includes('imsqti')) return t.includes('bank') ? ok('other') : ok('quiz');
  if (use === 'syllabus' || href.endsWith('course_settings/syllabus.html')) return ok('syllabus');
  if (t.startsWith('assignment') || use === 'assignment') return ok('assignment');

  if (isLearningApplication(r)) {
    if (files.some((f) => f.endsWith('assignment_settings.xml'))) return ok('assignment');
    if (href.endsWith('assessment_meta.xml') || files.some((f) => f.endsWith('assessment_meta.xml'))) {
      return ok('other', true);
    }
    if (href.includes('non_cc_assessments/') || href.endsWith('.qti')) return ok('other');
    if (files.some((f) => f.endsWith('course_settings.xml')) || href.endsWith('canvas_export.txt')) return ok('other');
    if (isHtmlPath(href)) return ok('page');
    return ok('other');
  }

  if (t === '' || t.includes('webcontent')) {
    if (href === '') return ok('other');
    return isHtmlPath(href) ? ok('page') : ok('file');
  }
  return ok('other');
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

export async function readXml(zip: ZipIndex, path: string | undefined): Promise<Document | null> {
  const text = await readText(zip, path);
  return text === null ? null : parseXml(text);
}

/** Copy Canvas assignment-style fields (direct children only) into meta. */
export function gradedMeta(el: Element, meta: ResourceMeta): void {
  const points = num(childText(el, 'points_possible'));
  if (points !== undefined) meta.points = points;
  const due = childText(el, 'due_at');
  if (due) meta.dueAt = due;
  const unlock = childText(el, 'unlock_at');
  if (unlock) meta.unlockAt = unlock;
  const lock = childText(el, 'lock_at');
  if (lock) meta.lockAt = lock;
  const sub = childText(el, 'submission_types');
  if (sub) meta.submissionTypes = sub;
  const group = childText(el, 'assignment_group_identifierref');
  if (group) meta.assignmentGroupId = group;
  const ws = childText(el, 'workflow_state');
  if (ws) meta.workflowState = ws;
}

const endsWith = (files: string[], suffix: string): string | undefined =>
  files.find((f) => f.toLowerCase().endsWith(suffix));

/** Meta helper resources this quiz/discussion depends on (Canvas puts meta there). */
function metaDependencies(r: RawResource, byId: Map<string, RawResource>): RawResource[] {
  return r.dependencies
    .map((id) => byId.get(id))
    .filter((d): d is RawResource => d !== undefined && isLearningApplication(d));
}

export async function enrich(
  zip: ZipIndex,
  r: RawResource,
  c: Classified,
  byId: Map<string, RawResource>,
): Promise<Enriched> {
  const out: Enriched = { kind: c.kind, hidden: c.hidden, meta: {} };
  const set = (title: string | undefined) => {
    if (title) out.fileTitle = title;
  };
  switch (c.kind) {
    case 'page':
    case 'syllabus':
      set(await enrichPage(zip, r, out.meta));
      break;
    case 'assignment':
      set(await enrichAssignment(zip, r, out.meta));
      break;
    case 'quiz':
      set(await enrichQuiz(zip, r, byId, out.meta));
      break;
    case 'discussion': {
      const d = await enrichDiscussion(zip, r, byId, out.meta);
      set(d.title);
      out.kind = d.kind;
      break;
    }
    case 'tool':
      set(await enrichTool(zip, r, out.meta));
      break;
    case 'link':
      set(await enrichLink(zip, r, out.meta));
      break;
    case 'file':
      set(enrichFile(r, out.meta));
      break;
    case 'other': {
      const o = await enrichOther(zip, r, out.meta);
      set(o.title);
      if (o.hidden) out.hidden = true;
      break;
    }
    case 'announcement':
      break;
  }
  return out;
}

async function enrichPage(zip: ZipIndex, r: RawResource, meta: ResourceMeta): Promise<string | undefined> {
  const path = r.href ?? r.files.find(isHtmlPath) ?? r.files[0];
  meta.mime = 'text/html';
  const html = await readText(zip, path);
  if (html === null) return undefined;
  const head = /<head[^>]*>[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html.slice(0, 4096);
  const doc = parseHtml(head);
  const ws = doc.querySelector('meta[name="workflow_state"]')?.getAttribute('content');
  if (ws) meta.workflowState = ws;
  const title = doc.title.trim();
  return title === '' ? undefined : title;
}

async function enrichAssignment(zip: ZipIndex, r: RawResource, meta: ResourceMeta): Promise<string | undefined> {
  const settings = endsWith(r.files, 'assignment_settings.xml');
  if (settings) {
    const doc = await readXml(zip, settings);
    if (doc) {
      gradedMeta(doc.documentElement, meta);
      return childText(doc.documentElement, 'title');
    }
    return undefined;
  }
  // CC 1.3 assignment extension: <assignment><title/><text/>…</assignment>
  const xml = r.href && /\.xml$/i.test(r.href) ? r.href : endsWith(r.files, '.xml');
  if (xml) {
    const doc = await readXml(zip, xml);
    if (doc) {
      const root = doc.documentElement;
      const gradable = child(root, 'gradable');
      const points = num(attr(gradable, 'points_possible'));
      if (points !== undefined) meta.points = points;
      return childText(root, 'title');
    }
    return undefined;
  }
  // Plain HTML assignment: reuse the page title.
  return enrichPage(zip, r, meta).then((t) => t?.replace(/^Assignment:\s*/i, ''));
}

async function enrichQuiz(
  zip: ZipIndex,
  r: RawResource,
  byId: Map<string, RawResource>,
  meta: ResourceMeta,
): Promise<string | undefined> {
  let title: string | undefined;
  let count = 0;

  const qtiPath = r.href ?? endsWith(r.files, '.xml') ?? r.files[0];
  const qti = await readXml(zip, qtiPath);
  if (qti) {
    title = attr(first(qti, 'assessment'), 'title');
    count = all(qti, 'item').length;
  }

  const deps = metaDependencies(r, byId);
  const metaPath =
    deps.map((d) => endsWith(d.files, 'assessment_meta.xml') ?? d.href).find((p) => p !== undefined) ??
    endsWith(r.files, 'assessment_meta.xml');
  const m = await readXml(zip, metaPath);
  if (m) {
    const root = m.documentElement;
    title = childText(root, 'title') ?? title;
    const description = childText(root, 'description');
    if (description) meta.description = description;
    gradedMeta(root, meta);
    const assignment = child(root, 'assignment');
    if (assignment) {
      const inner: ResourceMeta = {};
      gradedMeta(assignment, inner);
      if (meta.dueAt === undefined && inner.dueAt) meta.dueAt = inner.dueAt;
      if (meta.workflowState === undefined && inner.workflowState) meta.workflowState = inner.workflowState;
      if (meta.assignmentGroupId === undefined && inner.assignmentGroupId) {
        meta.assignmentGroupId = inner.assignmentGroupId;
      }
      if (meta.submissionTypes === undefined && inner.submissionTypes) meta.submissionTypes = inner.submissionTypes;
    }
  }

  if (count === 0) {
    // Canvas keeps question-bank-driven quizzes in non_cc_assessments/*.qti
    const bankPath = deps.map((d) => endsWith(d.files, '.qti')).find((p) => p !== undefined);
    const bank = await readXml(zip, bankPath);
    if (bank) {
      count = all(bank, 'item').length;
      if (count === 0) {
        for (const sel of all(bank, 'selection_number')) count += num(sel.textContent?.trim()) ?? 0;
      }
    }
  }
  if (count > 0) meta.questionCount = count;
  return title;
}

async function enrichDiscussion(
  zip: ZipIndex,
  r: RawResource,
  byId: Map<string, RawResource>,
  meta: ResourceMeta,
): Promise<{ title?: string; kind: Kind }> {
  let kind: Kind = 'discussion';
  const topic = await readXml(zip, r.href ?? r.files[0]);
  let title = topic ? childText(topic.documentElement, 'title') : undefined;

  for (const dep of metaDependencies(r, byId)) {
    const m = await readXml(zip, dep.href ?? dep.files[0]);
    if (!m || m.documentElement.localName !== 'topicMeta') continue;
    const root = m.documentElement;
    title = childText(root, 'title') ?? title;
    const type = childText(root, 'type');
    if (type) {
      meta.topicType = type;
      if (type.toLowerCase() === 'announcement') kind = 'announcement';
    }
    const ws = childText(root, 'workflow_state');
    if (ws) meta.workflowState = ws;
    const assignment = child(root, 'assignment');
    if (assignment) {
      // The topic's own state describes the row; the nested assignment only
      // contributes grading fields.
      gradedMeta(assignment, meta);
      if (ws) meta.workflowState = ws;
    }
    break;
  }
  const out: { title?: string; kind: Kind } = { kind };
  if (title) out.title = title;
  return out;
}

async function enrichTool(zip: ZipIndex, r: RawResource, meta: ResourceMeta): Promise<string | undefined> {
  const doc = await readXml(zip, r.href ?? r.files[0]);
  if (!doc) return undefined;
  const description = firstText(doc, 'description');
  if (description) meta.description = `<p>${escapeHtml(description)}</p>`;
  const url = firstText(doc, 'launch_url') ?? firstText(doc, 'secure_launch_url');
  if (url) meta.url = url;
  return firstText(doc, 'title');
}

async function enrichLink(zip: ZipIndex, r: RawResource, meta: ResourceMeta): Promise<string | undefined> {
  const doc = await readXml(zip, r.href ?? r.files[0]);
  if (!doc) return undefined;
  const root = doc.documentElement;
  const url = attr(child(root, 'url'), 'href') ?? attr(first(doc, 'url'), 'href');
  if (url) meta.url = url;
  const description = childText(root, 'description');
  if (description) meta.description = `<p>${escapeHtml(description)}</p>`;
  return childText(root, 'title') ?? firstText(doc, 'title');
}

function enrichFile(r: RawResource, meta: ResourceMeta): string | undefined {
  const href = r.href ?? r.files[0];
  if (!href) return undefined;
  meta.filename = safeDecode(basename(href));
  meta.mime = mimeFor(href);
  return meta.filename;
}

async function enrichOther(
  zip: ZipIndex,
  r: RawResource,
  meta: ResourceMeta,
): Promise<{ title?: string; hidden?: boolean }> {
  const href = (r.href ?? r.files[0] ?? '').toLowerCase();
  const isBank = r.type.toLowerCase().includes('imsqti') || href.includes('non_cc_assessments/') || href.endsWith('.qti');
  if (isBank) {
    const doc = await readXml(zip, r.href ?? r.files[0]);
    if (!doc) return {};
    let title: string | undefined;
    for (const field of all(doc, 'qtimetadatafield')) {
      if (childText(field, 'fieldlabel') === 'bank_title') {
        title = childText(field, 'fieldentry');
        break;
      }
    }
    title = title ?? attr(first(doc, 'assessment'), 'title');
    const count = all(doc, 'item').length;
    if (count > 0) meta.questionCount = count;
    return title ? { title } : {};
  }
  if (r.files.some((f) => f.toLowerCase().endsWith('course_settings.xml')) || href.endsWith('canvas_export.txt')) {
    return { title: 'Course settings' };
  }
  if (r.files.length === 1 && href.endsWith('.xml')) {
    const doc = await readXml(zip, r.files[0]);
    if (!doc) return {};
    const root = doc.documentElement;
    // Orphaned Canvas meta helpers never render as their own row.
    if (root.localName === 'topicMeta' || root.localName === 'quiz' || root.localName === 'assignment') {
      return { hidden: true };
    }
    const title = childText(root, 'title') ?? attr(root, 'title');
    return title ? { title } : {};
  }
  return {};
}
