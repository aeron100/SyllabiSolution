/**
 * Kind presentation metadata for the UI: display order, plural labels,
 * icons, and the short "renders as" hint (DESIGN.md §3, §10).
 * Colors live in src/styles/app.css under .kind-<kind>.
 */
import type { Kind, Resource } from '../lib/types';
import { KIND_LABEL } from '../lib/types';

export { KIND_LABEL };

/** Fixed display order for filter chips and the Unfiled group. */
export const KIND_ORDER: readonly Kind[] = [
  'syllabus',
  'page',
  'assignment',
  'quiz',
  'discussion',
  'announcement',
  'link',
  'tool',
  'file',
  'other',
];

export const KIND_PLURAL: Record<Kind, string> = {
  page: 'Pages',
  syllabus: 'Syllabus',
  assignment: 'Assignments',
  discussion: 'Discussions',
  announcement: 'Announcements',
  quiz: 'Quizzes',
  link: 'Links',
  tool: 'Tools',
  file: 'Files',
  other: 'Other',
};

/** Bootstrap Icons class per kind. Always paired with a text label. */
export const KIND_ICON: Record<Kind, string> = {
  page: 'bi-file-earmark-text',
  syllabus: 'bi-journal-text',
  assignment: 'bi-pencil-square',
  discussion: 'bi-chat-left-text',
  announcement: 'bi-megaphone',
  quiz: 'bi-patch-question',
  link: 'bi-link-45deg',
  tool: 'bi-plug',
  file: 'bi-paperclip',
  other: 'bi-question-circle',
};

export function isImageResource(res: Resource): boolean {
  if (res.meta.mime?.startsWith('image/')) return true;
  const name = res.meta.filename ?? res.href ?? '';
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(name);
}

/** One short line saying what a kind renders as, when that is not obvious. */
export function kindHint(res: Resource): string | null {
  switch (res.kind) {
    case 'syllabus':
      return 'Canvas Syllabus tab';
    case 'quiz':
      return 'Description and summary only';
    case 'tool':
      return 'Title and description only';
    case 'link':
      return 'Title linked to the address';
    case 'file':
      return isImageResource(res) ? 'Shown as a picture with a caption' : 'Title and filename only';
    case 'other':
      return 'Title only';
    default:
      return null;
  }
}
