/**
 * Shared contracts for the Syllabus Generator.
 * Every module (cartridge, process, generate, UI) builds against these types.
 * See DESIGN.md sections 3, 5, 6 for the rules behind them.
 */

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** Every kind is selectable. Each kind has a rendering rule (DESIGN.md §3). */
export type Kind =
  | 'page'          // wiki page (webcontent HTML)
  | 'syllabus'      // Canvas course_settings/syllabus.html (intendeduse="syllabus")
  | 'assignment'    // Canvas assignment (description HTML + assignment_settings.xml)
  | 'discussion'    // imsdt topic (Canvas meta type != announcement)
  | 'announcement'  // imsdt topic whose Canvas meta says type=announcement
  | 'quiz'          // imsqti assessment (+ Canvas assessment_meta.xml via dependency)
  | 'link'          // imswl web link
  | 'tool'          // imsbasiclti external tool
  | 'file'          // webcontent non-HTML file (image, pdf, docx, ...)
  | 'other';        // anything unrecognized (question banks, settings bundles, ...)

export const KIND_LABEL: Record<Kind, string> = {
  page: 'Page',
  syllabus: 'Syllabus',
  assignment: 'Assignment',
  discussion: 'Discussion',
  announcement: 'Announcement',
  quiz: 'Quiz',
  link: 'Link',
  tool: 'Tool',
  file: 'File',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Zip access
// ---------------------------------------------------------------------------

export interface ZipIndex {
  /** Entry names exactly as stored in the zip (directories excluded). */
  names(): string[];
  /** True if an entry exists with this exact name. */
  has(path: string): boolean;
  /**
   * Resolve a cartridge path to a real entry name.
   * Handles URL-encoding (%20), a leading "./" or "/", case differences,
   * and query strings (?canvas_=1). Returns null if nothing matches.
   */
  resolve(path: string): string | null;
  /** Uncompressed size in bytes, or undefined if missing. */
  size(path: string): number | undefined;
  /** Extract bytes lazily. Throws if the entry is missing. */
  bytes(path: string): Promise<Uint8Array>;
  /** Extract and decode as UTF-8 text. Throws if the entry is missing. */
  text(path: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Cartridge model
// ---------------------------------------------------------------------------

export interface Item {
  id: string;
  title: string;
  /** Set when the item points at a resource. Module headers have none. */
  resourceId?: string;
  children: Item[];
}

export interface ResourceMeta {
  points?: number;
  dueAt?: string;      // ISO string as found in the export
  unlockAt?: string;
  lockAt?: string;
  url?: string;        // links, tools
  description?: string; // HTML, for quizzes/links/tools
  questionCount?: number;
  filename?: string;
  mime?: string;
  submissionTypes?: string;
  assignmentGroupId?: string;
  /** e.g. "Instructor" when the manifest LOM says intendedEndUserRole=Instructor */
  intendedRole?: string;
  workflowState?: string; // published / unpublished / active
  /** Canvas discussion meta <type>: "announcement" or discussion type */
  topicType?: string;
}

export interface Resource {
  id: string;
  /** Raw type string from the manifest. */
  type: string;
  href?: string;
  files: string[];
  /** identifierrefs from <dependency>. Canvas puts quiz/discussion meta here. */
  dependencies: string[];
  kind: Kind;
  /** Best-known title: manifest item title, else the file's own title. */
  title: string;
  meta: ResourceMeta;
}

export interface AssignmentGroup {
  id: string;
  title: string;
  weight?: number;
}

export interface Cartridge {
  title: string;
  courseCode?: string;
  term?: string;
  startAt?: string;
  endAt?: string;
  language?: string;
  /** Common Cartridge schema version, e.g. "1.1.0". */
  version: string;
  source: 'canvas' | 'generic';
  /** Organization tree in manifest order. */
  items: Item[];
  resources: Map<string, Resource>;
  /** Resource ids not referenced by any item, sorted by kind then title. */
  unfiled: string[];
  assignmentGroups: AssignmentGroup[];
  zip: ZipIndex;
}

// ---------------------------------------------------------------------------
// Extraction (per kind) -> raw HTML body
// ---------------------------------------------------------------------------

export interface ExtractedContent {
  resourceId: string;
  kind: Kind;
  title: string;
  /**
   * Raw HTML body with any <html><head> wrapper removed. May be empty for
   * kinds with no body (file, other). For quiz/link/tool this is the
   * rendered rule output (description + summary line / linked title).
   */
  html: string;
  meta: ResourceMeta;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

export type ReportSeverity = 'fixed' | 'todo' | 'info';

export interface ReportEntry {
  /** Stable machine code, e.g. "heading-normalized", "image-missing-alt". */
  code: string;
  severity: ReportSeverity;
  /** Plain-language, one sentence. */
  message: string;
  sectionId?: string;
  sectionTitle?: string;
  count?: number;
  detail?: string;
}

/** Contextual notices the UI shows only when triggered (DESIGN.md §14). */
export type NoticeCode =
  | 'equations'
  | 'media-omitted'
  | 'external-images'
  | 'interactive-removed'
  | 'low-contrast'
  | 'missing-files';

export interface AssetRef {
  dataUri: string;
  bytes: number;
  mime: string;
}

export interface ProcessOptions {
  sectionId: string;
  sectionTitle: string;
  /**
   * resourceId -> sectionId for every selected item, so internal references
   * ($WIKI_REFERENCE$, $CANVAS_OBJECT_REFERENCE$) become anchors when the
   * target is also selected.
   */
  selectedSections: Map<string, string>;
  /**
   * Resolve a cartridge-relative href ($IMS-CC-FILEBASE$/..., relative paths)
   * to an embedded asset, or null if it is not in the export.
   */
  resolveAsset: (href: string) => Promise<AssetRef | null>;
  /**
   * Resolve a $WIKI_REFERENCE$/pages/<slug-or-id> to a resource id, or null.
   */
  resolveWikiRef?: (ref: string) => string | null;
  language?: string;
}

export interface ProcessedPage {
  resourceId: string;
  sectionId: string;
  title: string;
  kind: Kind;
  /** HTML string: structural fixes applied, inline formatting kept. */
  original: string;
  /** HTML string: structural fixes applied, styles translated then stripped. */
  neutral: string;
  report: ReportEntry[];
  notices: NoticeCode[];
  /** Total bytes of embedded assets in this section. */
  assetBytes: number;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Original keeps the instructor's formatting; Styled applies the clean layout in a palette. */
export type Presentation = 'original' | 'styled';

export const PRESENTATION_LABEL: Record<Presentation, string> = {
  original: 'Original',
  styled: 'Styled',
};

/** Palette ids. Values live in src/lib/generate/colors.ts (generated). */
export type PaletteId =
  | 'coastline'
  | 'golden-west'
  | 'orange-coast'
  | 'ink-paper'
  | 'ember-ash'
  | 'jade-gold'
  | 'sapphire-brass'
  | 'plum-blush'
  | 'slate-coral'
  | 'garnet-cream'
  | 'ochre-olive'
  | 'harbor-sand'
  | 'terracotta-moss';

export type PaletteRole = 'primary' | 'secondary' | 'accent' | 'tint' | 'paper';

/** A five-role palette (DESIGN.md §8). All hex, lower-case. */
export interface Palette {
  id: PaletteId;
  name: string;
  character: string;
  /** "institution" palettes come from a college's published brand guide; "general" ones from the Tailwind scales. */
  group: 'institution' | 'general';
  primary: string;
  secondary: string;
  accent: string;
  tint: string;
  paper: string;
  /** Where each role's value came from: a Tailwind token ("blue-900") or a brand-guide note. */
  source: Record<PaletteRole, string>;
}

export interface CoverInfo {
  courseTitle: string;
  courseCode?: string;
  term?: string;
  instructor?: string;
  email?: string;
  officeHours?: string;
  meetingTimes?: string;
  /** Institution name shown on the cover when a logo is included. */
  institution?: string;
  /** Institution logo as a data URI (embedded, self-contained). */
  logoDataUri?: string;
}

export interface DocOptions {
  presentation: Presentation;
  /** Palette for the Styled presentation; ignored for Original. */
  palette: PaletteId;
  showCover: boolean;
  showToc: boolean;
  pageBreaks: boolean;
  /** Optional "Generated on …" footer text. Off by default (determinism). */
  stamp?: string;
  /** BCP-47 language tag for the document. */
  language: string;
}

export interface SyllabusDoc {
  options: DocOptions;
  cover: CoverInfo;
  sections: ProcessedPage[];
}

export interface AssembledDoc {
  /** Complete standalone HTML document. Contains NO JavaScript. */
  html: string;
  bytes: number;
  report: { fixed: ReportEntry[]; todo: ReportEntry[]; info: ReportEntry[] };
  notices: NoticeCode[];
}
