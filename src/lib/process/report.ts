/**
 * Accessibility report collector. Every fix and every remaining problem is
 * counted under a stable code; messages are plain language, one sentence.
 * See DESIGN.md §9b–§9c.
 */
import type { NoticeCode, ReportEntry, ReportSeverity } from '../types';

type Message = (n: number) => string;

const one = (n: number, singular: string, plural: string): string => (n === 1 ? singular : plural);
const were = (n: number): string => one(n, 'was', 'were');

const MESSAGES: Record<string, { severity: ReportSeverity; message: Message }> = {
  // ---- fixed automatically ------------------------------------------------
  'heading-normalized': {
    severity: 'fixed',
    message: (n) => `${n} heading ${one(n, 'level was', 'levels were')} normalized so the outline has no gaps.`,
  },
  'heading-clamped': {
    severity: 'fixed',
    message: (n) => `${n} ${one(n, 'heading', 'headings')} deeper than level 6 ${were(n)} turned into bold lead-in paragraphs.`,
  },
  'redundant-title-removed': {
    severity: 'fixed',
    message: () => 'A first heading that repeated the section title was removed.',
  },
  'fake-heading-promoted': {
    severity: 'fixed',
    message: (n) => `${n} bold or oversized ${one(n, 'paragraph was', 'paragraphs were')} turned into real headings.`,
  },
  'fake-list-converted': {
    severity: 'fixed',
    message: (n) => `${n} ${one(n, 'list', 'lists')} typed as plain paragraphs ${were(n)} converted to real lists.`,
  },
  'table-header-added': {
    severity: 'fixed',
    message: (n) => `Header rows were added to ${n} ${one(n, 'table', 'tables')}.`,
  },
  'table-scope-added': {
    severity: 'fixed',
    message: (n) => `Header cells in ${n} ${one(n, 'table', 'tables')} were given a scope.`,
  },
  'layout-table-unwrapped': {
    severity: 'fixed',
    message: (n) => `${n} layout ${one(n, 'table was', 'tables were')} unwrapped into ordinary content.`,
  },
  'empty-link-unwrapped': {
    severity: 'fixed',
    message: (n) => `${n} empty ${one(n, 'link', 'links')} or ${one(n, 'link', 'links')} with no destination ${were(n)} unwrapped.`,
  },
  'duplicate-link-merged': {
    severity: 'fixed',
    message: (n) => `${n} adjacent duplicate ${one(n, 'link was', 'links were')} merged.`,
  },
  'anchor-link-rewritten': {
    severity: 'fixed',
    message: (n) => `${n} in-page ${one(n, 'link was', 'links were')} repointed to the new heading anchors.`,
  },
  'internal-link-anchored': {
    severity: 'fixed',
    message: (n) => `${n} ${one(n, 'link', 'links')} to other selected pages now ${one(n, 'points', 'point')} to ${one(n, 'its', 'their')} section.`,
  },
  'decorative-image-marked': {
    severity: 'fixed',
    message: (n) => `${n} decorative ${one(n, 'image was', 'images were')} marked so screen readers skip ${one(n, 'it', 'them')}.`,
  },
  'filename-alt-cleared': {
    severity: 'fixed',
    message: (n) =>
      `${n} ${one(n, 'image', 'images')} whose alt text was just a filename ${were(n)} marked decorative; check whether ${one(n, 'it needs', 'they need')} a description.`,
  },
  'empty-paragraph-removed': {
    severity: 'fixed',
    message: (n) => `${n} empty ${one(n, 'paragraph', 'paragraphs')} used as spacing ${were(n)} removed.`,
  },
  'list-markup-fixed': {
    severity: 'fixed',
    message: (n) => `${n} ${one(n, 'list', 'lists')} with stray items or bad nesting ${were(n)} repaired.`,
  },
  'table-headers-fixed': {
    severity: 'fixed',
    message: (n) => `Header-cell references in ${n} ${one(n, 'table', 'tables')} were repointed so they still resolve.`,
  },
  'empty-heading-demoted': {
    severity: 'fixed',
    message: (n) =>
      `${n} ${one(n, 'heading', 'headings')} with no text (an image only) ${were(n)} turned into ${one(n, 'a paragraph', 'paragraphs')}.`,
  },
  'invalid-lang-removed': {
    severity: 'fixed',
    message: (n) => `${n} invalid language ${one(n, 'attribute was', 'attributes were')} removed.`,
  },

  // ---- still needs you ----------------------------------------------------
  'image-missing-alt': {
    severity: 'todo',
    message: (n) => `${n} ${one(n, 'image needs', 'images need')} a text description (alt text).`,
  },
  'image-empty-alt': {
    severity: 'todo',
    message: (n) =>
      `${n} ${one(n, 'image is', 'images are')} marked decorative (empty alt text); confirm ${one(n, 'it carries', 'they carry')} no meaning, or add a description.`,
  },
  'image-link-needs-text': {
    severity: 'todo',
    message: (n) =>
      `${n} ${one(n, 'link contains', 'links contain')} only an image; give the image alt text that says where the link goes.`,
  },
  'image-may-contain-text': {
    severity: 'todo',
    message: (n) => `${n} ${one(n, 'image appears', 'images appear')} to contain text; that text should also appear on the page.`,
  },
  'vague-link-text': {
    severity: 'todo',
    message: (n) => `${n} ${one(n, 'link has', 'links have')} vague text such as "click here"; say where the link goes.`,
  },
  'link-email-mismatch': {
    severity: 'todo',
    message: (n) => `${n} email ${one(n, 'link shows', 'links show')} one address but ${one(n, 'points', 'point')} to another; make them match.`,
  },
  'low-contrast': {
    severity: 'todo',
    message: (n) => `${n} text ${one(n, 'run uses', 'runs use')} colors with low contrast against ${one(n, 'its', 'their')} background.`,
  },
  'external-image': {
    severity: 'todo',
    message: (n) => `${n} ${one(n, 'image is', 'images are')} hosted outside the export and will not appear.`,
  },
  'missing-image': {
    severity: 'todo',
    message: (n) => `${n} ${one(n, 'image was', 'images were')} not found in the export and will not appear.`,
  },
  'equation-image': {
    severity: 'todo',
    message: (n) => `${n} equation ${one(n, 'image', 'images')} cannot be shown; the source text appears as code instead.`,
  },

  // ---- for information ----------------------------------------------------
  'interactive-removed': {
    severity: 'info',
    message: (n) => `${n} embedded ${one(n, 'video or tool was', 'videos or tools were')} replaced with a link.`,
  },
  'interactive-stripped': {
    severity: 'info',
    message: (n) => `${n} embedded ${one(n, 'object, form, or control was', 'objects, forms, or controls were')} removed.`,
  },
  'media-omitted': {
    severity: 'info',
    message: (n) => `${n} ${one(n, 'video or audio clip was', 'videos or audio clips were')} left out; a note marks where ${one(n, 'it', 'each')} was.`,
  },
  'file-link-unwrapped': {
    severity: 'info',
    message: (n) =>
      `${n} ${one(n, 'link', 'links')} to ${one(n, 'a file', 'files')} in the export ${were(n)} turned into plain text with the filename; attachments cannot travel in one HTML file.`,
  },
  'internal-link-unwrapped': {
    severity: 'info',
    message: (n) => `${n} ${one(n, 'link', 'links')} to course pages or items not in this syllabus ${were(n)} turned into plain text.`,
  },
  'lms-link-unwrapped': {
    severity: 'info',
    message: (n) => `${n} ${one(n, 'link', 'links')} back to the source LMS ${were(n)} turned into plain text.`,
  },
  'anchor-link-unwrapped': {
    severity: 'info',
    message: (n) => `${n} in-page ${one(n, 'link', 'links')} pointed at ${one(n, 'an anchor', 'anchors')} that no longer ${one(n, 'exists', 'exist')} and ${were(n)} turned into plain text.`,
  },
  'hidden-content-removed': {
    severity: 'info',
    message: (n) => `${n} hidden ${one(n, 'element', 'elements')} (display: none) ${were(n)} removed.`,
  },
  'script-removed': {
    severity: 'info',
    message: (n) => `${n} ${one(n, 'script or event handler was', 'scripts or event handlers were')} removed.`,
  },
  'inline-svg-removed': {
    severity: 'info',
    message: (n) => `${n} inline SVG ${one(n, 'drawing was', 'drawings were')} removed; ${one(n, 'it', 'they')} cannot be checked for safety.`,
  },
  'title-only': {
    severity: 'info',
    message: () => 'This item is not a page (a question bank or settings bundle, for example); only its title appears.',
  },
};

const NOTICE_ORDER: NoticeCode[] = [
  'equations',
  'media-omitted',
  'external-images',
  'missing-files',
  'interactive-removed',
  'low-contrast',
];

const MAX_DETAILS = 6;

export class Reporter {
  private readonly counts = new Map<string, { n: number; details: string[] }>();
  private readonly noticeSet = new Set<NoticeCode>();

  constructor(
    private readonly sectionId: string,
    private readonly sectionTitle: string,
  ) {}

  /** Count `n` occurrences of `code`; `detail` is a short example shown to the user. */
  add(code: string, n = 1, detail?: string): void {
    if (n <= 0) return;
    let rec = this.counts.get(code);
    if (!rec) {
      rec = { n: 0, details: [] };
      this.counts.set(code, rec);
    }
    rec.n += n;
    if (detail) {
      const d = detail.length > 80 ? detail.slice(0, 77) + '…' : detail;
      if (rec.details.length < MAX_DETAILS && !rec.details.includes(d)) rec.details.push(d);
    }
  }

  has(code: string): boolean {
    return this.counts.has(code);
  }

  notice(code: NoticeCode): void {
    this.noticeSet.add(code);
  }

  /** Entries in first-seen order; deterministic for the same input. */
  entries(): ReportEntry[] {
    const out: ReportEntry[] = [];
    for (const [code, rec] of this.counts) {
      const def = MESSAGES[code] ?? { severity: 'info' as ReportSeverity, message: (n: number) => `${n} × ${code}.` };
      const entry: ReportEntry = {
        code,
        severity: def.severity,
        message: def.message(rec.n),
        sectionId: this.sectionId,
        sectionTitle: this.sectionTitle,
        count: rec.n,
      };
      if (rec.details.length) entry.detail = rec.details.join('; ');
      out.push(entry);
    }
    return out;
  }

  notices(): NoticeCode[] {
    return NOTICE_ORDER.filter((c) => this.noticeSet.has(c));
  }
}
