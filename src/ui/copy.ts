/**
 * All user-facing copy in one place. Wording follows DESIGN.md §10 and §14
 * exactly; keep sentences short and plain.
 */
import type { NoticeCode, Presentation } from '../lib/types';

export const APP_NAME = 'Syllabus Generator';

/** §14 — always visible, one line (empty state and header). */
/** Attribution line: under the hero title and in the footer of every step. */
export const REASSURANCE = 'Product of Coastline College Institutional Effectiveness Department';

export const STEPS: readonly string[] = ['Upload', 'Choose pages', 'Arrange and style', 'Finalize'];

/** §10 — "How to export from Canvas" disclosure: three short steps. */
export const EXPORT_STEPS: readonly string[] = [
  'In your Canvas course, open Settings and choose Export Course Content.',
  'Pick Course as the export type and start the export.',
  'When it finishes, download the .imscc file and drop it here.',
];

/** §10 — the hero's four highlight tiles (no visible heading): plain claims, each true of the app as built. */
export interface HeroFeature {
  /** Stable key; the step picks the icon by it. */
  id: 'easy' | 'access' | 'local' | 'themes';
  title: string;
  /** One plain sentence. */
  text: string;
}
export const HERO_FEATURES: readonly HeroFeature[] = [
  {
    id: 'easy',
    title: 'Easy to use',
    text: "Upload your export, check the pages you want, pick a look, and you're done.",
  },
  {
    id: 'access',
    title: 'Accessibility report',
    text: 'Headings, lists, tables and links are tidied up, and a report shows what still needs a person.',
  },
  {
    id: 'local',
    title: 'Nothing leaves your computer',
    text: 'Your export is read in your browser; nothing is uploaded or stored.',
  },
  {
    id: 'themes',
    title: 'Multiple themes',
    text: 'Coastline, Golden West and Orange Coast looks, plus ten more.',
  },
];

/** §14 — "What to expect" disclosure, one sentence each. */
export const EXPECT_ITEMS: readonly string[] = [
  'Your syllabus is built from pages already in your course export.',
  'Instructor name, email, and office hours are not in the export; enter them on the cover form.',
  "Equations (LaTeX) can't be shown; their source text is used instead.",
  'All scripts, embedded tools, iframes, and forms are removed. The file you download contains none.',
  'Videos and audio are left out.',
  "Images hosted outside the export won't appear.",
  '"Original" keeps your formatting but can\'t fix color contrast.',
  'Nothing leaves your browser and nothing is stored.',
  'Print from Chrome or Edge for best results.',
  'Large exports make large files; images are reduced automatically.',
  "Refreshing or closing the page starts over. You'll be asked to confirm if you haven't saved yet.",
];

/** §14 — "About accessibility" disclosure on step 1. Mirrors §6d (fixed) and §9b (reported); names the limits. */
export interface DisclaimerGroup {
  title: string;
  items: readonly string[];
}
export const ACCESSIBILITY_DISCLAIMER = {
  label: 'About accessibility',
  lead:
    'The generator makes the structure of your syllabus meet WCAG 2.2 AA and uses colors checked for contrast. It cannot judge content. What it finds but cannot fix is listed in the report on the last step.',
  groups: [
    {
      title: 'Fixed every time',
      items: [
        'Headings are put in order: one title, no skipped levels.',
        'Bold lines used as headings and paragraphs used as lists become real headings and lists.',
        'Tables whose first row is bold get a real header row; tables used only for layout are unwrapped.',
        'Empty links are removed.',
        'The document gets a title, a language, landmarks, a skip link, and a table of contents.',
        'Scripts, forms, and embedded tools are removed.',
        'Every look except Original uses colors checked for contrast at readable sizes.',
      ],
    },
    {
      title: 'Reported, not fixed',
      items: [
        'Images with no description, or a description that is only a file name.',
        'Links that say "click here" or show a bare web address.',
        'Meaning carried by color alone.',
        'Images that appear to contain text.',
        'Low contrast in the Original look, which keeps your colors.',
      ],
    },
    {
      title: 'Not detected',
      items: [
        'Image descriptions that exist but are wrong.',
        'Headings that are in order but say nothing useful.',
        'Instructions that rely on sight, like "see the box on the right".',
        'Passages in another language.',
        'Complex tables with merged cells that need their headers linked by hand.',
        'The rules that spot fake headings and decorative images can miss or misjudge; the report lists every change so you can check.',
      ],
    },
  ] as readonly DisclaimerGroup[],
  closing:
    'A syllabus is fully accessible only when the report\'s "Still needs you" list is clear and you have checked the things no tool can see, mainly whether descriptions and link text make sense.',
} as const;

/** §8 — one line under the look gallery crediting where the palettes come from. */
export const LOOK_SOURCES =
  "College colors come from each college's published brand guide. More looks use the Tailwind CSS color scales. Every look is checked for contrast.";

/** §14 — contextual notices keyed by the processing NoticeCode. */
export const NOTICE_COPY: Record<NoticeCode, string> = {
  equations: "Equations can't be shown. Their source text is used instead.",
  'media-omitted': 'Videos and audio are left out. A note marks where each was.',
  'external-images': "Some images are hosted outside the export and won't appear.",
  'missing-files': "Some images are hosted outside the export and won't appear.",
  'interactive-removed': 'Embedded tools, forms, and scripts are removed.',
  'low-contrast': 'Original keeps your colors. Some text may be hard to read; see the report.',
};

/** Display order for processing notices. */
export const NOTICE_ORDER: readonly NoticeCode[] = [
  'interactive-removed',
  'equations',
  'media-omitted',
  'external-images',
  'missing-files',
  'low-contrast',
];

export const NOTICE_DOWNLOAD_FIRST = 'Print or save your syllabus before leaving. Refreshing starts over.';
export const NOTICE_PRINT_BROWSER = 'For best results, print from Chrome or Edge.';
export function noticeLargeFile(mb: number): string {
  return `This file is large (${mb} MB). Images were reduced to keep it manageable.`;
}
/** Output size above which the "large file" notice shows. */
export const LARGE_FILE_BYTES = 20 * 1024 * 1024;

export const PRESENTATION_DESC: Record<Presentation, string> = {
  original: 'Keeps your own formatting and colors.',
  styled: 'A clean layout in the palette you choose.',
};

export const STATUS = {
  reading: 'Reading your course export…',
  found: (pages: number, modules: number) =>
    `Found ${pages} ${pages === 1 ? 'page' : 'pages'} in ${modules} ${modules === 1 ? 'module' : 'modules'}.`,
  generating: 'Generating…',
  ready: 'Your syllabus is ready.',
  previewing: 'Preparing preview…',
  /** After Download: announced through the live region and shown on step 4. */
  saved: 'Saved. You can close this page.',
  reportSaved: 'Report saved.',
};

export const HINTS = {
  previewEmpty: 'Click a page to preview its content.',
  documentEmpty: 'Check pages on the left to add them here.',
  treeEmpty: 'No pages match the current filter.',
  cover: 'These are not in your export. Everything here is optional.',
  fileTypes: 'Accepts .imscc or .zip',
};
