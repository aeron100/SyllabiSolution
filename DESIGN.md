# Syllabus Generator — Design

Status: Phase 1 implemented. Run `npm run dev` and open the app; tests via
`npm test`; production build via `npm run build`, which writes one
self-contained file as `docs/SyllabiSolution.html` (to email or share)
and the same file as `docs/index.html` (for static hosting).
In development, `?load=/__dev/<file>.imscc` loads an export from the project
root without uploading.
Last updated: 2026-09-03 (Phase 1 built: wizard, tiles, palettes, Coastline branding)

## 1. Overview

A browser-only web app that takes an IMS Common Cartridge export (`.imscc`),
lets the instructor pick and order the pages they want, and generates a single
continuous, print-ready, accessible syllabus as one self-contained HTML page.
The instructor prints to PDF from their browser.

Everything is procedural. No AI inference anywhere in Phase 1. No server.

### Goals

- Upload a cartridge, see its content, pick pages, pick a look, get a document.
- Runs entirely in the browser. Course content never leaves the machine.
- Output is one HTML file: self-contained, offline, prints cleanly to PDF.
- Output is structurally accessible (WCAG 2.2 AA where procedurally possible).
- The app itself is WCAG 2.2 A and AA conformant, point-and-click and touch friendly.
- Deterministic: same cartridge + same selections + same theme = same output.

### Non-goals (Phase 1)

- Synthesized schedule or assignment tables from metadata (Phase 2).
- AI rewriting, alt-text generation, summarization (Phase 2b, optional).
- Editing the generated document inside the app.
- DOCX export.
- Replicating the source LMS's own stylesheet (not in the cartridge anyway).
- Rendering LaTeX or equations. Equation images are produced by the LMS
  server and are not in the export. See section 14.
- Accounts, saving projects, sharing links.

## 2. Principles

1. **Client-only.** Static HTML/CSS/JS on any host. No runtime backend.
2. **Procedural.** Rules over models. Presentation and structure are fixed by
   rules; content is never rewritten.
3. **Content vs presentation.** Anything about how it *looks* is ours.
   Anything about what it *says* is theirs and stays untouched.
4. **Print is the deliverable.** The on-screen page is continuous; print CSS
   handles pagination. PDF comes from the browser's print dialog.
5. **Accessible by construction.** Structural fixes always run. What cannot be
   fixed procedurally is reported, never silently ignored.
6. **Honest labels.** "Original" means "your inline formatting", not "looks
   like Canvas". The UI never promises more than the cartridge contains.
   Limits are stated on the page as disclaimers (section 14).
7. **No JavaScript in the output.** All script is stripped from page content,
   and the generated file itself contains none. Download and Print live in
   the app, not in the document.
8. **One artifact.** One build produces one self-contained HTML file,
   `docs/index.html`, that works identically hosted on any static server
   and opened from disk by double-clicking (`file://`). Code, styles, fonts,
   icons and the logo are inlined; the app makes no network or file request
   of its own. The course export is read through the File API only.

## 3. The IMSCC format

An `.imscc` is a zip. `imsmanifest.xml` at the root has two parts that matter:

- **Organizations** — a nested tree of `<item>` elements with titles. This is
  the module/folder structure. It is the default ordering for the syllabus.
- **Resources** — a flat list keyed by identifier, each with a `type`, an
  `href`, and `<file>` children. Items reference resources by `identifierref`.

Resource types and the kind tag each maps to. **Everything is selectable.**
Each kind has a rendering rule so a selected item always produces a section.

| Type string | Kind tag | What it is | Renders as |
|---|---|---|---|
| `webcontent` (HTML) | Page | Wiki page | Full HTML body |
| `webcontent` (image) | File | Uploaded image | A figure with the image and its title as caption |
| `webcontent` (other) | File | PDF, DOCX, etc. | Title and filename; contents cannot be embedded |
| `…/learning-application-resource` + `syllabus.html` | Syllabus | Canvas syllabus | Full HTML body |
| `…/learning-application-resource` + assignment | Assignment | Assignment | Description HTML, plus points and due date when present |
| `imsdt_xmlv1p1` | Discussion | Discussion topic | Topic body HTML |
| `imsqti_xmlv1p2/assessment` | Quiz | Quiz (QTI) | Title, description HTML, and a summary line (question count, points). Questions themselves are not included |
| `imswl_xmlv1p1` | Link | Web link | Title as a link to the URL, plus description if any |
| `imsbasiclti_xmlv1p0` | Tool | External tool (LTI) | Title and description only; launch URLs are useless outside the LMS |
| anything else | Other | Unrecognized | Title only, flagged in the report |

Canvas adds a non-standard `course_settings/` folder:
`course_settings.xml` (title, course code, term), `syllabus.html`,
`assignment_groups.xml`, `module_meta.xml`, `files_meta.xml`.

Canvas page bodies:

- Wrapped in `<html><head><meta name="identifier"><meta name="editing_roles"><title>…</title></head><body>…</body></html>`.
- Contain placeholder links: `$IMS-CC-FILEBASE$/…`, `$WIKI_REFERENCE$/pages/…`,
  `$CANVAS_OBJECT_REFERENCE$/…`, `$CANVAS_COURSE_REFERENCE$/…`.
- Contain absolute links back to the source Canvas instance that will not resolve.

Format drift: Canvas has shipped several manifest namespace versions
(CC 1.0 through 1.3). Moodle, Blackboard, D2L, and Schoology export CC with
different folder layouts. The parser must be **namespace-agnostic** (match on
local element names) with a **generic CC core** plus a **Canvas extension layer**.

## 4. Pipeline

```
upload
  └─ 1. read zip central directory (fflate), extract only imsmanifest.xml
        and course_settings/course_settings.xml if present
  └─ 2. parse manifest → Cartridge { items[], resources{} }   (DOMParser)
  └─ 3. classify resources → kind + selectable flag
  └─ 4. user selects + orders items; preview extracts files lazily
  └─ 5. per selected item, process HTML:
        a. unwrap Canvas <html><head> wrapper
        b. safety strip (DOMPurify + our rules)
        c. asset + link rewriting
        d. structural accessibility pass
        e. PRESENTATION SWITCH:
             Original  → keep inline formatting
             Styled    → translate-then-strip styles
  └─ 6. assemble: cover, TOC, sections, theme CSS, print CSS,
        toolbar, accessibility report
  └─ 7. export: open in new tab; Download HTML; Print
```

Steps 5a–5d produce the same DOM for every presentation choice. Step 5e
produces two variants, both computed once at parse time, so switching themes
on the preview page is instant (stylesheet swap + variant toggle, no re-parse).

## 5. Data model

```
Cartridge
  title: string
  courseCode?: string
  term?: string
  version: string              // CC version detected from namespace
  source: "canvas" | "generic"
  items: Item[]                // organization tree, in manifest order
  resources: Map<string, Resource>
  zip: ZipIndex                // entries by path, extracted lazily

Item
  id: string
  title: string
  resourceId?: string
  children: Item[]

Resource
  id: string
  type: string                 // raw type string from manifest
  href: string
  files: string[]
  kind: "page" | "syllabus" | "assignment" | "discussion"
      | "quiz" | "link" | "tool" | "file" | "other"
  // every kind is selectable; kind drives the rendering rule (section 3)
  meta?: { points?: number; dueAt?: string; url?: string;
           questionCount?: number; filename?: string; mime?: string }

Selection
  entries: { resourceId: string }[]   // ordered

ProcessedPage                  // cached per resource after step 5
  resourceId: string
  title: string                // from manifest item, not page <h1>
  original: DocumentFragment   // structural fixes, inline formatting kept
  neutral: DocumentFragment    // structural fixes, styles stripped
  assets: Map<string, DataUri>
  report: ReportEntry[]        // fixed + remaining a11y findings

SyllabusDoc
  presentation: "original" | "styled"
  palette: PaletteId                               // Styled only; see §8
  showCover: boolean
  showToc: boolean
  cover: { courseTitle, courseCode?, term? }
  sections: { id, title, kind, html }[]
  report: { fixed: ReportEntry[], remaining: ReportEntry[] }
```

## 6. Content processing rules

### 6a. Unwrap and extract per kind

- Page, Syllabus: strip the Canvas `<html><head>…</head><body>` wrapper;
  keep body children.
- Assignment: description HTML from the assignment resource; points and
  due date from `assignment_settings.xml` when present.
- Discussion: topic body HTML from the `imsdt` XML.
- Quiz: description HTML and item count from the QTI XML; points if present.
- Link: URL and description from the `imswl` XML; rendered as a paragraph
  with the title linked.
- Tool: title and description from the `imsbasiclti` XML; no launch URL.
- File: images become a figure; HTML files are treated as pages; all other
  files render as a title line with the filename.
- Other: title only.

Every kind then goes through 6b–6e like any page, so the same safety,
link, structure, and presentation rules apply regardless of source.

### 6b. Safety strip (always, every mode)

**All JavaScript is removed, without exception:**

- `<script>` elements, including inside inline `<svg>` and `<math>`.
- Every `on*` event-handler attribute.
- `javascript:`, `vbscript:`, and `data:text/html` URLs in `href`, `src`,
  `action`, `formaction`, `xlink:href`, `srcdoc`.
- `<meta http-equiv="refresh">`, `<base>`, `<noscript>`.

Also removed: `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<form>` and
all form controls, `<style>` blocks, `<link rel="stylesheet">`, and any
`<link>` at all. `<video>` and `<audio>` are replaced with a short
"media omitted" note.

Implementation: DOMPurify with an explicit deny-by-default tag and
attribute allowlist, followed by our own pass for media replacement and
equation handling (6c). The rule is enforced twice: once on each page during
processing, and once on the fully assembled document before it is offered
for download, as a final guard. A test asserts the output contains no
`<script>`, no `on*` attribute, and no `javascript:` URL.

### 6c. Assets and links

- `$IMS-CC-FILEBASE$/…` and relative `href`/`src` → look up zip entry →
  embed as data URI. Output is one self-contained file.
- `$WIKI_REFERENCE$/pages/<slug>` → if the target page is also selected,
  rewrite to an internal anchor `#sec-<id>`; otherwise unwrap to plain text.
- `$CANVAS_OBJECT_REFERENCE$/…`, `$CANVAS_COURSE_REFERENCE$/…` → unwrap to
  plain text (targets do not exist outside Canvas).
- Absolute links to the source LMS domain → unwrap to plain text.
- All other external `http(s)` links → keep as links.
- Images referencing files not in the zip → keep `alt`, drop `src`, flag in report.
- **Canvas equation images** (`<img class="equation_image">`, `src` under
  `/equation_images/`) are rendered by the Canvas server and are not in the
  export. They are replaced with their `alt` text (the LaTeX source) as
  inline `<code>` and flagged. LaTeX is **not** rendered. Pages containing
  them trigger the equation disclaimer in the UI (section 14).
- `<math>` (MathML) elements are kept as-is after script stripping; browsers
  render MathML natively. This is the only equation form that survives.

### 6d. Structural accessibility pass (always, every mode)

Runs before the presentation switch. Produces the same outline regardless
of theme.

**Heading normalization**

- Section title (from the manifest item) is rendered as `<h2>`. `<h1>` is
  reserved for the course title on the cover.
- Find the highest heading level used inside the page; shift so that level
  becomes `<h3>`. Relative structure inside the page is preserved.
- Close up skipped levels (`h3` → `h5` with nothing between becomes `h3` → `h4`).
- Clamp anything past `<h6>` and render it as a bold lead-in paragraph.
- If the page's first heading matches the section title (trimmed,
  case-insensitive), drop it as redundant.

**Fake heading promotion** — a paragraph becomes a heading when all hold:

- Short: under ~80 characters, no terminal period.
- Entirely bold, or bold + underline, with no other text in the paragraph;
  or entirely uppercase; or inline `font-size` larger than surrounding text.
- Standing alone: not inside a list item or table cell.

Promoted headings land one level below the nearest real heading above them,
then go through normalization with everything else. Pages with no headings
get nothing promoted.

**Other structural fixes**

- Fake lists (consecutive paragraphs starting with `-`, `•`, `*`, or `1.`,
  `2.`, …) → real `<ul>` / `<ol>`.
- Tables with no header row whose first row is entirely bold → first row
  converted to `<th>` in `<thead>`.
- `colspan`/`rowspan` preserved. Layout tables (single cell, or nested with
  no data) → unwrapped.
- Empty links and links with no `href` → unwrapped. Adjacent duplicate links
  to the same target → merged.
- Vague link text ("click here", "here", "this page", "link", bare URLs) →
  kept but flagged in report.
- Email links whose visible text is one address but whose target is
  another → kept but flagged in report ("link-email-mismatch").
- Images: preserve existing `alt`. Empty `alt` plus tiny dimensions or a
  filename-like `alt` → treated as decorative (`alt=""`), flagged. Missing
  `alt` on a content image → flagged.
- Images that appear to contain text (heuristic: large, wide aspect, in a
  paragraph by itself, filename hints like "screenshot") → flagged.
- Document: `lang` attribute, page `<title>`, one `<h1>`, `<main>` landmark,
  skip link, `<nav>` for the TOC.

### 6e. Presentation switch

**Original** — keep inline formatting.

- Inline `style`, `class`, colors, fonts, and sizes are left alone.
- When a fake heading is promoted, carry the paragraph's inline style onto
  the new heading element so it looks the same as before.
- `width`/`height` on images and tables preserved, but the Original
  stylesheet applies `max-width: 100%` so nothing clips in print.
- Contrast cannot be fixed without changing their colors → flagged only.

**Styled** — translate, then strip.

Translate before removing (these carry meaning):

| Source | Becomes |
|---|---|
| `font-weight: bold` on a span | `<strong>` |
| `font-style: italic` | `<em>` |
| `text-decoration: underline` | `<u>` |
| `text-decoration: line-through` | `<s>` |
| `text-align: center` / `right` on a block | our own alignment class |
| explicit pixel width on an image | percentage of content width, capped |

Then remove:

- All `class` and `id` attributes (we generate our own anchors).
- All inline `style` attributes.
- `<font>`, `<center>`, and `<span>`/`<div>` wrappers left empty of attributes.
- `width`/`height` attributes on tables and cells.

Keep as-is: `p`, headings, `ul`/`ol`/`li`, `table` family, `blockquote`,
`a`, `img`, `hr`, `br`, `sup`, `sub`, `code`, `pre`, `strong`, `em`, `u`, `s`.

Accepted loss in Styled: hand-applied color coding (e.g. red exam
rows). Phase 2 may map source colors to a small semantic palette.

## 7. Output document

The generated file is pure HTML and CSS. It contains **no JavaScript**.

Structure:

```
<html lang>
  <head> title, inlined theme CSS, inlined print CSS
  <body>
    skip link
    <header> cover band: course title (h1), code, term,
             instructor name (large, in the band),
             then email / office hours / meeting times — optional
    <nav> table of contents                              — optional
    <main>
      <section id="sec-…"> <h2>title</h2> … </section>   × N
    </main>
    <footer> generated-on stamp                          — opt-in
```

The Download and Print controls, and the accessibility report, live in the
app beside the preview, not inside the document. The app shows the
assembled document in a sandboxed `<iframe>`; Print calls the iframe's
`print()`, and Download builds a Blob from the document source.

Print CSS in every presentation:

- `@page` margins; page break before each `<section>` (toggle, see 15);
  break after cover and TOC.
- Orphan/widow control; headings keep with next; tables avoid splitting rows.
- TOC links become static text.
- Dark or heavy fills collapse to black on white.
- Running headers and page numbers only where browsers support them;
  the on-screen page stays continuous.

Download offers the file as `<course-code>-syllabus.html`.

## 8. Presentation options

Two choices. Original keeps their formatting. Styled applies one clean
layout in a named color palette. There are no other style controls.

| Option | Variant | What the user controls |
|---|---|---|
| Original | `original` | Nothing. Their inline formatting is kept. Stylesheet adds only the page frame, cover, TOC, section spacing, print rules, and `max-width` caps. |
| Styled | `neutral` | One named palette. One clean layout: humanist sans body, clear heading hierarchy, generous spacing. |

### Palettes

Two groups, shown as two labelled rows in the gallery:

- **Institution palettes** come from a college's published brand guide
  and lead the gallery. Coastline (navy #0c3b60, steel blue #3591bc, slate
  blue #325979, light-blue tint, from the 2021 Coastline brand guide's
  color harmony page) is the default. Golden West (Sea Green #006a71 and
  a Sunny Yellow #ffde59 tint, from the GWC branding guide). Orange Coast
  (Pantone 2768 blue #071d49 and Pantone 021 orange, from the OCC branding
  guidelines; the orange is deepened 8% for dividers so it meets 3:1). The
  district publishes no brand guide, so it has no palette. Roles a guide
  does not define are derived from its colors and say so in the `source`
  field. The gallery labels the two groups "College colors" and "More
  looks". One hint line under the gallery credits the sources: college
  colors from each college's brand guide, the rest from the Tailwind CSS
  color scales, every look checked for contrast (`LOOK_SOURCES`).
- **General palettes** come from the Tailwind CSS scales, below.


A palette is a coordinated set of five color roles, not a pair. Every
palette is fixed and verified for AA. Shown as swatches (a small stack of
the five colors) with the name beneath, in a radio group. No color inputs.

**Roles in every palette:**

| Role | Used for |
|---|---|
| `primary` | Cover title band, section headings, table header background, TOC heading |
| `secondary` | Rules and dividers, captions, kind labels, blockquote bar |
| `accent` | Links, callout markers, small highlights. Must pass 4.5:1 on paper as text |
| `tint` | Light surface: TOC background, table zebra stripe, blockquote background. Ink text on it must pass 4.5:1 |
| `paper` | Page background, warm or cool white per palette. Body text is always ink (near-black) |

**Sourcing.** No invented colors. Every value comes from the Tailwind CSS
v3 color scales, a published system with 22 hue families, each graded in
11 lightness steps (50 to 950) that were tuned to look coordinated across
hues. Values are imported from the `tailwindcss/colors` package by
`scripts/make-palettes.mjs` and written into `generate/colors.ts`, so the
hex codes are exact, not recalled. The script refuses to write if any
role pairing fails the contrast rules below. Alternatives considered: Radix
Colors (accessibility-stepped, but less familiar) and the U.S. Web Design
System tokens (contrast-graded, but a heavier dependency). Tailwind wins
on familiarity, exact importability, and consistent lightness.

**Role to step mapping,** the same for every palette so they behave alike:

| Role | Step | Why |
|---|---|---|
| `primary` | hue **800** or **900** | Dark enough for 4.5:1 text on white and for white text on it |
| `secondary` | complement **500** or **600** | Visible as a rule (≥ 3:1) without competing with headings |
| `accent` | complement or hue **700** or **800** | Dark enough for link text at 4.5:1 |
| `tint` | hue **50** or **100** | Light surface; ink text on it passes easily |
| `paper` | white, `stone-50`, or `neutral-50` | Warm or cool white to match the hue temperature |

**Pairings** follow classic harmonies: a dark hue with its complement or
split-complement for secondary and accent, and neutrals from the same
temperature (warm `stone`, cool `slate`, neutral `neutral`).

**The set.** Ten to start. Each is a data row covered by the contrast test.

| Name | primary | secondary | accent | tint | paper | Character |
|---|---|---|---|---|---|---|
| Ink & Paper | neutral-900 | neutral-500 | neutral-700 | neutral-100 | white | Black and white. Cheapest to print. |
| Ember & Ash | orange-800 | stone-500 | amber-700 | orange-50 | stone-50 | Warm, energetic |
| Jade & Gold | emerald-800 | emerald-600 | yellow-700 | emerald-50 | white | Calm, natural |
| Sapphire & Brass | blue-900 | amber-600 | sky-800 | sky-50 | white | Classic academic |
| Plum & Blush | purple-900 | rose-500 | fuchsia-800 | rose-50 | stone-50 | Rich, literary |
| Slate & Coral | slate-800 | teal-600 | rose-700 | slate-100 | white | Cool, technical |
| Garnet & Cream | red-900 | stone-500 | yellow-700 | amber-50 | stone-50 | Traditional |
| Ochre & Olive | yellow-800 | lime-700 | orange-800 | yellow-50 | stone-50 | Earthy, archival |
| Harbor & Sand | cyan-900 | teal-600 | amber-800 | cyan-50 | white | Coastal, quiet |
| Terracotta & Moss | orange-900 | lime-800 | stone-600 | orange-50 | stone-50 | Mediterranean |

Default: Coastline.

**Contrast test per palette:** `primary` and `accent` as text on `paper`
≥ 4.5:1; paper text on `primary` surface ≥ 4.5:1; ink text on `tint`
≥ 4.5:1; `secondary` ≥ 3:1 against `paper` where it forms a rule or
boundary. Any palette that fails is a failing test, so a bad hex cannot
ship.

Layout toggles are separate from style and apply to both options: cover
page, the Coastline College logo on the cover (shown small beside its
switch), table of contents, page break between sections. Print keeps
`primary` on headings since it passes on white, and collapses tints and
surfaces to paper to save ink.

Phase 2 candidate: per-section override (whole document Styled, one
carefully formatted schedule page kept Original).

## 9. Accessibility

### 9a. The app (WCAG 2.2 A + AA)

- **2.5.7 Dragging movements** — reordering has Move Up / Move Down buttons
  and arrow-key support. Pointer drag is an enhancement only.
- **2.5.8 Target size** — every control ≥ 44×44 CSS px; primary tiles
  56 px tall. Well above the AA minimum of 24 px.
- **2.4.7 / 2.4.11 Focus visible, not obscured** — strong custom focus rings;
  no sticky chrome that can cover a focused element.
- **1.4.3 / 1.4.11 Contrast** — text 4.5:1, controls and icons 3:1, in light
  and dark mode. Checked automatically in the build.
- **4.1.3 Status messages** — "Reading cartridge", "Found N pages", errors
  announced via a live region without moving focus.
- **2.1.1 Keyboard** — the content tree is nested checkbox groups with
  disclosure buttons, not a custom ARIA tree. No special key handling needed.
- **3.2.6 / 3.3.7** — Back never loses state; nothing is re-entered.
- Reduced motion respected. Every control has a visible label or accessible
  name. Icons never stand alone.

### 9b. The generated document

Structural conformance is guaranteed by section 6d. What remains is content
and is reported, not fixed:

- Images with missing or meaningless `alt`.
- Vague link text.
- Meaning conveyed by color only (detectable in Original; meaning unknown).
- Images that appear to contain text.
- Low contrast in Original body content.

### 9c. The accessibility report

Two lists, shown in the app beside the generated document and downloadable
as a separate file. The report is never embedded in the syllabus itself.

- **Fixed automatically** — e.g. "14 heading levels normalized, 3 lists
  converted, header rows added to 2 tables, 5 decorative images marked."
- **Still needs you** — e.g. "6 images need descriptions" with the section
  each is in, "4 links say 'click here'", "1 table uses color to convey
  meaning."

Phase 2b turns "still needs you" into proposed fixes shown for approval,
never applied silently.

## 10. UI

### Audience

Faculty. Many will use this once a term. Intuitiveness and guidance win
over text. Rules:

- **Show the path.** A four-step strip at the top, always visible:
  1 Upload → 2 Choose pages → 3 Arrange and style → 4 Finalize. The
  current step is highlighted; completed steps get a check. One step on
  screen at a time, so each screen has one job.
- **Guide in place.** Each panel's empty state says what to do next in one
  sentence ("Check pages on the left to add them here"). Hints sit next
  to the control they explain, never in a separate help page.
- **Sensible defaults.** Syllabus page pre-checked and first in the
  default order (position 1; every page checked after it follows in the
  order it was checked), Styled preselected with Sapphire & Brass, cover
  and TOC on. Only the first module starts expanded; later modules and Unfiled
  start collapsed so a large export reads as a short list of modules. A
  first-time user can upload and click Generate.
- **One sentence, then a link.** Any explanation is one short sentence
  with an optional "Learn more" disclosure. No paragraphs in the UI.
- **Plain words.** "Course export" not "cartridge", "pages" not
  "resources", "look" not "theme", "Download" not "export".
- **Just-in-time notices.** Warnings appear only when relevant, inline
  where the issue is, and are dismissible.
- **Progress and reassurance.** Uploading shows "Reading your course
  export…" then "Found 42 pages in 8 modules." Generate shows the result
  immediately with the Download button in the same place every time.
- **Nav top and bottom.** Back and Next sit under the step heading and
  again at the foot of the step, so they are in view before and after a
  long body. Same names, same actions.
- **Leave-page guard.** Once a course export is loaded, the app registers a
  `beforeunload` handler so a refresh, back navigation, or tab close asks
  the user to confirm. Browsers do not allow a page to block leaving, only
  to prompt, and they show their own generic wording, not ours. The guard
  is armed on upload and disarmed after a successful Download, so a user
  who has saved their file is not nagged. This handler is in the app only;
  the generated file still contains no JavaScript.

### Flow: a hero and a four-step wizard

One step on screen at a time, full width, with Back and Next directly
under the step heading and again at the foot, and the step strip above
showing where you are.
Completed steps in the strip are buttons that jump back. Focus moves to
the step heading whenever the step changes, so keyboard and screen reader
users always know where they landed. Nothing is persisted; Back and Next
keep state in memory.

**Step 1 — Upload (the hero).**
The app name in display serif, large. Under it the attribution line
"Product of Coastline College Institutional Effectiveness Department".
Then a large drop target drawn as a sheet of paper with a
dashed edge and an inline SVG motif of pages stacking into a document. A
real "Choose a file" button inside it, the single centered primary tile;
there is no sample to try, because the app never downloads anything
(section 2, principle 8). Below, in small type, the three disclosures: "How
to export from Canvas", "What to expect", and "About accessibility". Between the drop target and
those disclosures sit two labelled sections in the same column (at most
64 rem wide): a feature band, "Why faculty like it", of four paper cards
with the tile sheen but the sheet's radius and shadow, so they read as
paper, not buttons (not controls: no widget role, no focus; the lists carry
an explicit `role="list"` so WebKit keeps them lists), each with one large
navy icon on a light-blue plate, a bold title and one plain sentence
(print or save as PDF; accessible by design; nothing leaves your
computer; your college's colors), one across on phones, two from 576 px,
four from 992 px. Under it, "How it works" is an ordered list of the four
wizard steps, each a numbered navy badge, the strip's own label in bold and
one sentence, laid out as a row joined by a CSS-only hairline from 768 px
and stacked below. Beside the feature band's title on wide screens only
(≥ 992 px) a decorative cover card, `aria-hidden`, mocks a styled cover
in pure CSS with the inlined logo: the navy band, a paper title block
reading "Course title" / "Instructor name" in muted placeholder text, and
two grey text lines, never a real course, name, or code. When a file is
read, the app announces "Found 33 pages in 9 modules" and advances to step
2 on its own.

**Step 2 — Choose pages.**
Two columns on wide screens, stacked on narrow. Left: a "Content types"
dropdown (closed by default, reading e.g. "2 of 9 shown"), a small toolbar
with Select all shown, Clear shown and the selected count, then the page
tree as a paper sheet in normal flow, so the page scrolls as a whole.
Right: the preview, drawn as a paper sheet sized to the viewport and
sticky in its own column, so it stays in view while the tree scrolls, the
same behaviour as step 3. Clicking a title previews it; the intro says the
preview is optional. Selection order is document order; checked rows
show their position badge. On narrow screens the columns stack and a tap
on a title scrolls the preview into view.

**Step 3 — Arrange and style.**
Two columns on wide screens (≥ 992 px). Left, about 42 %: the look picker
as a gallery first — Original as a card showing the user's own formatting,
then the palette swatches as cards, each a small stack of its five colors
with the name beneath, the chosen one marked by a 3 px navy border and a
check — then the four layout toggles, then "Your syllabus", the ordered
list of selected items with Move up, Move down, and Remove and Alt+Arrow
reordering, and last the cover form (instructor, email, office hours,
meeting times, language). Right, about 58 %: a permanent "Preview" pane —
heading, the hint "Updates as you change the look, order, and cover.", and
the live document on a sheet of paper at least 70 vh tall — that sticks to
the top of its own grid column while the left column scrolls, so it can
never cover a focused control. On narrow screens everything stacks in one
column in the order Look, Preview (always visible, at least 55 vh, never
behind a disclosure), Layout, Your syllabus, Cover, so a palette tap shows
its effect directly beneath the gallery. A look change re-assembles the
preview from cached pages within 50 ms; an order, cover, or language edit
waits 300 ms; meanwhile the previous document stays on the sheet, marked
busy, and its scroll position is restored when the new one loads. A small
"Updating…" chip appears (and is announced) only once the wait passes about
400 ms, so a quick look change never flashes it and typing in the cover form
never talks. A build that fails shows its error and leaves the pane quiet
until the next edit, which retries. Next reads "Generate syllabus" and is
the primary action.

**Step 4 — Finalize.**
The finished document, full width, on the desk surface, in a sandboxed
iframe. Above it a compact bar, in this order: "Print / PDF export" (the
primary tile, with a PDF icon, because the browser's print dialog is also
the accessible PDF path), "Accessibility report", "Save HTML", the file
name and size, and a "Start over" link. Beside or below, the accessibility report as two disclosures,
"Fixed automatically" and "Still needs you", with counts, and a "Download
report" button. Contextual notices appear here and on step 3.

**Step strip.** Four numbered steps: 1 Upload, 2 Choose pages, 3 Arrange
and style, 4 Finalize. Current step is filled with the accent and marked
`aria-current="step"`. Completed steps show a check and are buttons.
Future steps are plain text.

**Course syllabus group.** The Canvas Syllabus tab content is not in any
module, so it would otherwise hide inside the collapsed Unfiled group while
being pre-checked. It gets its own group at the top of the tree, "Course
syllabus", open by default, with the hint "Canvas Syllabus tab" under the
row so it is never mistaken for a wiki page that happens to be titled
Syllabus. A wiki page titled Syllabus is just a page.

**Content tree rows.** Checkbox, kind tag, title. Kind tags are text
labels with a distinct color and icon per kind, never color alone. Every
kind is selectable. A short secondary line shows what a kind renders as
when it is not obvious (Quiz: "description and summary only"). Modules are
disclosures with a tri-state checkbox. Header-only items are subheaders.
Pages not in any module appear under "Unfiled", sorted by title. The
syllabus is pre-checked; nothing else is.

**Filter bar.** Named "Content types" (it was "Course content"), and kept
behind that disclosure so a long tree starts higher on the page. One toggle
chip per kind present in the export, with a count. Only Syllabus and
Pages start on, because those are what a syllabus is most likely made
of. Every other kind starts hidden: still listed and selectable once its
chip is turned on, so nothing is ever missing, and the dropdown's
"2 of 9 shown" says more exists.
Turning a chip off hides that kind from the tree; selections are kept, just
hidden; the disclosure button's suffix ("7 of 9 shown") says so while it is
closed. "Select all shown" and "Clear shown" stay outside the disclosure, in
the toolbar above the pane, and act on whatever the filter is showing. Chips
are real toggle buttons with `aria-pressed`, not color-only.

**Disclaimers** follow section 14: one line up front, contextual notices
when triggered, and the full list behind a single "What to expect"
disclosure.

**Dev aid.** In development only, `?load=<url>` fetches a cartridge on
startup and lands on step 2. It is the one `fetch` in the code base. It lives
only inside the `import.meta.env.DEV` guard of the boot effect, not on the
hook's actions, so it is compiled out of the production build:
`docs/index.html` contains no `fetch` call at all, which
`test/build/single-file.test.ts` asserts.

### Look and feel

Bootstrap 5.3 + Bootstrap Icons, vendored into the build (not loaded from
CDN at runtime) and, like the fonts and the logo, inlined into the one
HTML file, so the site works offline, from disk, and makes no third-party
requests. Solid surfaces only — no translucent or "liquid" controls, because
they make contrast unverifiable. Light and dark mode.

### Visual identity

The brief: it must not look like an ordinary web page or a stock Bootstrap
dashboard. It should feel like a well-set document being assembled on a
desk. Editorial, calm, confident.

- **Metaphor.** The workspace is a desk. The content tree is a stack of
  index cards. The preview and result are sheets of paper with a soft
  shadow on a neutral desk surface. The syllabus looks like a document
  before it is printed, because it is one.
- **Typography.** A display serif for headings and the app name
  (self-hosted, e.g. Fraunces), a clean humanist sans for UI text and
  controls (self-hosted, e.g. Inter). Large, confident headings. Real
  typographic hierarchy: size and weight, not color, carries structure.
  Tabular numerals for counts.
- **Institution header.** The Coastline College logo sits at the top left
  of every screen, with the tagline "Institutional Effectiveness" set in
  small caps beside or beneath it, and the app name "Syllabus Generator"
  after a hairline. The logo is the current official horizontal shield
  mark from the college's branding page, kept as an SVG under
  `src/assets/` and inlined at build time as a `data:` URI
  (`LOGO_DATA_URI`), so neither the header nor the cover ever fetches it
  and the same bytes go into the generated document. The older "Coastline
  Community College" mark found in the export is not used. The header is a
  landmark
  (`<header>` with the logo as a linked image whose alt text is
  "Coastline College").
- **Color.** The app uses Coastline College's official brand colors from
  its published brand guide: Primary Navy `#003764` (Pantone 2955C),
  Secondary Blue `#6BC4E8` (297C), and Secondary Blue `#3CB4E5` (298C).
  Navy is the accent for text, links, primary tiles, and the current
  step; it passes AA on paper with room to spare. The two light blues
  are surfaces and highlights only: tints behind ink text, the sheen on
  navy tiles, the progress rule. They fail as text on white and are never
  used that way. Paper is a cool white to suit the navy. Deep ink for
  text. Kind tags get a small palette coordinated with the navy. Dark
  mode is charcoal and cool grey, not pure black, with the light blues
  carrying the accent role since navy fails on dark.
  Brand page: https://www.coastline.edu/branding
- **Layout.** Generous whitespace. Panels are distinct surfaces with
  subtle borders and shadows, not boxes with thick outlines. The four-step
  strip is a strong editorial header, with a hairline progress rule.
- **The hero.** Step 1 is a hero, not a grey dropzone: the app name in
  display serif, the one-line promise, a large drop target drawn as a
  dashed sheet of paper with an inline SVG motif of pages stacking into a
  document, and the three disclosures below in small type.
- **Motion.** Small, purposeful: a sheet sliding in when a preview loads,
  a check drawing on a completed step. All under 200 ms and removed under
  reduced-motion.
- **Tiles, not buttons.** Controls are large, flat, touch-first tiles in
  the Metro tradition: solid fill, bold label, one icon, generous padding.
  Primary actions (Next, Generate syllabus, Download) are 56 px tall and
  full width on narrow screens. Secondary actions (Back, Start over,
  Print) are 48 px. Every choice is a tile too: the Original card and
  each palette card in the look gallery, the drop target, the step strip
  entries, the filter chips (40 px, pill-shaped). Minimum hit area
  anywhere is 44 × 44 px.
- **The glass sheen.** Tiles get a faint top-edge highlight, a soft
  shadow, and a slight lift on hover and press, so they read as glass
  tiles catching light. The fill stays fully opaque. Nothing translucent
  ever sits over content, so every label's contrast is measurable and
  guaranteed. Pressed state darkens the fill; disabled state drops the
  sheen and shadow and lowers to 3:1 minimum on the label.
- **Details.** Kind tags are pills with an icon and a text label. Counts
  use tabular figures. Focus rings use the accent color, 3 px, offset from
  the tile so they never vanish against its fill.
- **Restraint.** No decorative gradients beyond the sheen, no
  transparency over content, no stock illustrations, no emoji. Every
  visual element earns its place.

## 11. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | Static output; types for the parser |
| UI | React | Tree, preview, reorder list |
| Zip | `fflate` | Pure JS, selective extraction, handles large cartridges |
| XML | browser `DOMParser` | Built in, namespace aware |
| Sanitize | `DOMPurify` | Standard, browser-native |
| HTML processing | DOM APIs | Built in |
| Styling | Bootstrap 5.3 (vendored) | Accessible components, AA defaults |
| Tests | Vitest + jsdom, `axe-core` | Parser and processing units; a11y checks |

Runtime dependencies are exactly two: `fflate` and `DOMPurify`.

Proposed layout:

```
src/
  main.tsx, App.tsx
  lib/
    cartridge/   unzip.ts  manifest.ts  classify.ts  content.ts  types.ts
    process/     unwrap.ts sanitize.ts  links.ts  structure.ts
                 headings.ts  styles.ts  report.ts
    generate/    assemble.ts  colors.ts (generated)  themes/{base,original,styled,print}.ts
  steps/         UploadStep  ChooseStep  ArrangeStep  DownloadStep
  components/    shell/{Header,StepStrip,WizardFrame,HeroArt}  ui/{Tile,ChoiceTile,Swatch,…}
scripts/         make-palettes.mjs
  components/    Dropzone  ContentTree  Preview  SelectionList
                 PresentationPicker  GenerateBar  StatusRegion
  fixtures/      sample-canvas.imscc (synthetic, built by a script)
```

## 12. Testing

- **Manifest parsing** against a synthetic Canvas-style fixture and a
  minimal generic CC 1.1 fixture. Namespace variants covered.
- **Processing rules** as unit tests on HTML snippets: heading demotion,
  fake heading promotion, fake list conversion, table header promotion,
  link rewriting for each placeholder form, style translation table.
- **Determinism**: same input → byte-identical output.
- **One artifact**: `test/build/single-file.test.ts` parses `docs/index.html`
  and asserts nothing in it can start a request: no external script, style,
  font or image; every `url()` and `src` a `data:` URI; no `fetch`, XHR,
  worker, dynamic import or `?load=` path in the bundle.
- **Accessibility**: `axe-core` against the app and against a generated
  document in Original and in every Styled palette, plus a contrast test
  over every palette's color roles.
- **Manual**: keyboard-only walkthrough and a VoiceOver pass before Phase 1
  is called done. Automated tools catch roughly a third of AA issues.
- **Real cartridges**: test against at least one real Canvas export and one
  Moodle export before committing to the parser model.

## 13. Phases

**Phase 1 — Concatenation (this document).**
Upload, parse, select, order, Original or Styled in a named palette,
structural accessibility, report, single HTML output, print to PDF.

**Phase 2a — Procedural beautification.** No AI, still no server.
Schedule and grading tables synthesized from assignment metadata and
`assignment_groups.xml`; date-column detection; "Week N" schedule detection;
callouts keyed on headings like Policy / Note / Important; semantic color
mapping; per-section presentation override.

**Phase 2b — Optional AI polish.** First point that needs an API key
(server-held or bring-your-own-key in the browser). Proposed alt text,
link-text rewrites, condensing, duplicate merging, schedule extraction from
prose. Every suggestion shown for approval; nothing applied silently.

## 14. Disclaimers (user-facing)

Principle: short, contextual, just-in-time. Never a wall of text. Each
notice is one sentence in plain words; detail lives behind a disclosure.

### Always visible (one line, under the hero title and in the footer)

> Product of Coastline College Institutional Effectiveness Department

The "nothing is uploaded" promise moved into the "What to expect" list
(items 1 and 8) rather than standing on its own.

### Contextual notices (only when triggered, inline, dismissible)

| Trigger | Notice |
|---|---|
| Equation images found | "Equations can't be shown. Their source text is used instead." |
| Video or audio found | "Videos and audio are left out. A note marks where each was." |
| Image not in export | "Some images are hosted outside the export and won't appear." |
| Interactive content found | "Embedded tools, forms, and scripts are removed." |
| Original look chosen and low contrast detected | "Original keeps your colors. Some text may be hard to read; see the report." |
| Output above size threshold | "This file is large (38 MB). Images were reduced to keep it manageable." |
| Before download, first time | "Download your syllabus before leaving. Refreshing starts over." |
| Refresh, back, or close with unsaved work | Browser's own "Leave site?" confirmation via `beforeunload` (wording is the browser's, not ours) |
| Print clicked in Safari or Firefox | "For best results, print from Chrome or Edge." |

### "What to expect" disclosure (full list, one sentence each)

1. Your syllabus is built from pages already in your course export.
2. Instructor name, email, and office hours are not in the export; enter them on the cover form.
3. Equations (LaTeX) can't be shown; their source text is used instead.
4. All scripts, embedded tools, iframes, and forms are removed. The file you download contains none.
5. Videos and audio are left out.
6. Images hosted outside the export won't appear.
7. "Original" keeps your formatting but can't fix color contrast.
8. Nothing leaves your browser and nothing is stored.
9. Print from Chrome or Edge for best results.
10. Large exports make large files; images are reduced automatically.
11. Refreshing or closing the page starts over. You'll be asked to confirm if you haven't downloaded yet.

### "About accessibility" disclosure (step 1, third disclosure)

One lead sentence, then three short lists, then a closing sentence. The
wording lives in `ui/copy.ts` (`ACCESSIBILITY_DISCLAIMER`) and mirrors
sections 6d and 9b: structure is guaranteed, content is reported, and the
limits of the heuristics are named rather than implied.

- **Lead.** The generator makes the structure of your syllabus meet WCAG
  2.2 AA and uses colors checked for contrast. It cannot judge content.
  What it finds but cannot fix is listed in the report on the last step.
- **Fixed every time.** Heading order; fake headings and fake lists made
  real; header rows on bold-first-row tables and layout tables unwrapped;
  empty links removed; title, language, landmarks, skip link, contents;
  scripts, forms and embedded tools removed; contrast-checked colors in
  every look but Original.
- **Reported, not fixed.** Missing or file-name image descriptions; "click
  here" and bare-address links; meaning by color alone; images of text; low
  contrast in Original.
- **Not detected.** Wrong-but-present descriptions; empty-meaning headings;
  sight-only instructions; passages in another language; complex tables
  needing explicit header links; and the fact that the promotion and
  decorative-image rules are heuristics (the report lists every change).
- **Closing.** Fully accessible only when "Still needs you" is clear and the
  instructor has checked what no tool can see.

## 15. Additional considerations

### Decisions made while reading the real export

- **Announcements** are a distinct kind. Canvas exports announcements as
  discussion topics whose metadata says `type=announcement`. They get
  their own tag so instructors can filter them out.
- **Question banks** (`non_cc_assessments/*.xml.qti`) are tagged Other
  with their bank title. They are not syllabus content but stay selectable.
- **Quiz and discussion metadata resources** are folded into the item they
  describe. They do not appear as separate rows.
- **Iframes with an http(s) source become a link** ("Embedded content:
  youtube.com") instead of vanishing. YouTube embed URLs are rewritten to
  watch URLs. The frame itself is still removed; only the destination
  survives as a plain link. This is safer than removal for a syllabus,
  where a lost video link is a lost reading.
- **File links** (PDF, DOCX in the export) are unwrapped to text with the
  filename appended. A single self-contained HTML file cannot carry
  attachments.
- **No course export is ever bundled.** The real export is used only by
  local tests and is excluded from the build. The former "Try a sample"
  tile and its shipped `public/sample.imscc` are gone: a sample would need
  a download, and the app makes none (section 2, principle 8). The same
  small synthetic cartridge still exists as a test fixture, built in
  memory by `test/fixtures/make-sample.mjs`.
- **Dev-only loading.** In development the app accepts `?load=<url>` and
  the dev server exposes any `.imscc` in the project root at `/__dev/`.
  Neither exists in the production build.
- **Opening from disk (`file://`) and CORS, in plain words.** When a page
  is opened by double-clicking the HTML file, the browser treats it as
  having no origin at all. In that state it refuses to let the page fetch
  other files, even ones sitting in the same folder, because it cannot
  tell a harmless local file from a page that wants to read the user's
  disk. Hosted pages have the opposite limit: they may only fetch from
  their own site unless the other site opts in (CORS). A page that fetched
  its logo, fonts, or a sample would therefore work in one place and
  silently break in the other. Inlining everything sidesteps both rules:
  there is nothing left to fetch. Reading the user's chosen course export
  is unaffected because the File API hands the page the bytes the user
  picked, which every browser allows from any origin, including none.

| Concern | Handling | Phase |
|---|---|---|
| Instructor info not in cartridge | Optional cover form | 1 |
| Canvas equation images | Alt text (LaTeX source) shown inline as code; flagged; disclaimer | 1 |
| External-URL images | Drop `src`, keep `alt`, flag; contextual notice | 1 |
| Output size | Downscale images above 1600 px wide via `<canvas>`; show size before download | 1 |
| Preview safety | Preview and generated document rendered in a sandboxed `<iframe>` | 1 |
| Page break per section | Toggle; default on | 1 |
| Same resource in several modules | Shown in each place, selectable once | 1 |
| Duplicate titles | Unique anchors; TOC entries disambiguated with module name | 1 |
| Document language | From course settings if present, else browser language; picker on cover form | 1 |
| URL-encoded cartridge paths | Decode before zip lookup; case-insensitive match | 1 |
| Narrow screens | Two-column steps stack; the wizard stays one step per screen | 1 |
| Browser print differences | Disclaimer recommends Chrome or Edge | 1 |
| Refresh loses work | No persistence. `beforeunload` confirmation while work is unsaved; disarmed after Download. Disclaimer says a refresh starts over | 1 |
| Opened from disk (`file://`) | One self-contained `docs/index.html`; every asset inlined, no fetch. `vite-plugin-singlefile`, `base: './'`, and a build test (`test/build/single-file.test.ts`) keep it that way | 1 |
| `.zip` instead of `.imscc` | Accept both | 1 |
| Generated-on stamp | Opt-in, off by default, to keep output byte-identical | 1 |
| MathML | Kept; browsers render it natively | 1 |

## 16. Open questions

1. Any house style from courseorbit.com to match in the app or a theme?

Resolved:

- A real course export will be provided for testing (owner: user).
- Everything is selectable, tagged by kind, filterable by kind.

## 17. Decision log

| Decision | Choice | Reason |
|---|---|---|
| Hosting | Client-only, static | Privacy, zero cost, no runtime |
| Output | Single self-contained HTML, browser print for PDF | Zero dependencies, offline, deterministic |
| Assets | Data URIs | One file; portable and offline |
| Selectable content | Everything, tagged by kind, filterable | Instructor decides; each kind has a rendering rule |
| Default order | Manifest organization tree | It is the instructor's own structure |
| Selection order | Order = selection order; badges on both steps; reordering only on step 3 | One list is the document; a checked row shows where it will land |
| Section titles | From manifest items, not page `<h1>` | Page headings are inconsistent |
| Structural a11y | Always runs, every mode | Invisible to sighted users, large value; "may as well" |
| Original mode | Keep inline formatting, fix structure | Honest, useful, still accessible |
| Styled look | One layout, named five-role palettes, nothing else | Simple for faculty; AA verified per palette |
| Theme switching | Stylesheet swap + variant toggle | Instant on preview |
| Reordering | Buttons + keys first, drag second | WCAG 2.2 2.5.7 |
| UI framework | Bootstrap 5.3, vendored | Accessible defaults; no CDN at runtime |
| Tiles with a glass sheen, opaque fills | Metro-style large tiles; sheen is decorative only | Touch-first; contrast stays measurable |
| AI | None in Phase 1; opt-in in 2b | Content vs presentation line |
| JavaScript | Stripped from content; none in output file | Safety; controls live in the app |
| LaTeX | Unsupported; alt text shown inline | Equation images are not in the export |
| Disclaimers | On the page, plain language | Set expectations; the tool builds from existing pages |
| Report location | In the app, separate download | Keeps the syllabus file clean |
| Persistence | None; refresh starts over | Simplicity and privacy; stated as a disclaimer |
| Leave-page guard | `beforeunload` confirm, armed on upload, disarmed after Download | Browsers can only prompt, not block |
| UI copy | Guidance over text; one sentence then a disclosure | Faculty audience, occasional use |
| UI flow | Hero plus four-step wizard, one step per screen | Three panels were cramped and generic |
| Step 4 name | "Finalize" | Print/PDF is the primary action, so "Download" was inaccurate |
| Content types default | Only Syllabus and Pages shown; all other kinds hidden until turned on | Most likely syllabus material first; nothing is ever missing |
| Editing the output | None; save the HTML and edit it elsewhere | Edits would be lost on regenerate and bypass the structural pass |
| Branding | Coastline College logo + "Institutional Effectiveness" tagline in the header; accent from the logo blue | Sponsor identity; coordinated palette |
