/**
 * The design contract in CSS (DESIGN.md §9a, §10): every text pair ≥ 4.5:1
 * and every control boundary ≥ 3:1 in light AND dark mode, computed from
 * src/styles/tokens.css (jsdom has no layout, so axe cannot do this); focus
 * is never removed for :focus-visible; nothing sticky covers focus; motion
 * stays ≤ 200 ms and is zeroed under reduced motion; the small controls keep
 * their 44 px hit areas. A change to a token or a rule that breaks the
 * contract fails here, before it ships.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Kind } from '../../src/lib/types';

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(resolve(ROOT, f), 'utf8');

const tokensCss = read('src/styles/tokens.css');
const appCss = read('src/styles/app.css');
const stepCss = {
  'src/steps/UploadStep/UploadStep.css': read('src/steps/UploadStep/UploadStep.css'),
  'src/steps/ChooseStep/choose.css': read('src/steps/ChooseStep/choose.css'),
  'src/steps/ArrangeStep/arrange.css': read('src/steps/ArrangeStep/arrange.css'),
  'src/steps/DownloadStep/download.css': read('src/steps/DownloadStep/download.css'),
};
const allCss: Record<string, string> = { 'src/styles/app.css': appCss, 'src/styles/tokens.css': tokensCss, ...stepCss };

// ---------------------------------------------------------------------------
// WCAG contrast from the token file
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function hex(c: string): RGB {
  const m = c.trim().replace('#', '');
  const s = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function lum([r, g, b]: RGB): number {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: RGB, b: RGB): number {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Parse one `{ … }` block of custom properties, resolving var() references. */
function parseTokens(css: string, blockStart: RegExp, fallback: Map<string, string> = new Map()): Map<string, string> {
  const start = css.search(blockStart);
  if (start < 0) throw new Error(`block not found: ${blockStart}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = new Map<string, string>(fallback);
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) raw.set(m[1], m[2].trim());
  const out = new Map<string, string>();
  const resolveVar = (name: string, seen = 0): string => {
    const v = raw.get(name);
    if (v === undefined) throw new Error(`unknown token ${name}`);
    const vm = v.match(/^var\((--[\w-]+)\)$/);
    if (vm) return seen > 10 ? v : resolveVar(vm[1], seen + 1);
    return v;
  };
  for (const k of raw.keys()) out.set(k, resolveVar(k));
  return out;
}

const LIGHT = parseTokens(tokensCss, /:root,\s*\[data-bs-theme='light'\]/);
const DARK = parseTokens(tokensCss, /\[data-bs-theme='dark'\]\s*\{/, LIGHT);

function color(mode: Map<string, string>, expr: string): RGB {
  if (expr.startsWith('--')) {
    const v = mode.get(expr);
    if (!v || v === 'transparent') throw new Error(`no opaque token ${expr}`);
    return hex(v);
  }
  return hex(expr);
}

interface Pair {
  /** A token (--sg-…) or a hex literal. */
  fg: string;
  bg: string;
  /** 4.5 for text, 3 for UI boundaries, icons, and focus rings. */
  min: number;
  where: string;
}

const KINDS: Kind[] = ['page', 'syllabus', 'assignment', 'discussion', 'announcement', 'quiz', 'link', 'tool', 'file', 'other'];

const PAIRS: Pair[] = [
  // Body text on every opaque surface.
  { fg: '--sg-ink', bg: '--sg-desk', min: 4.5, where: 'html,body; .chip-count' },
  { fg: '--sg-ink', bg: '--sg-paper', min: 4.5, where: '.sg-sheet / .hero-feature (light)' },
  { fg: '--sg-ink', bg: '--sg-tile', min: 4.5, where: '.tile / .card-row / .form-control / .hero-feature (dark)' },
  { fg: '--sg-ink', bg: '--sg-tile-hover', min: 4.5, where: '.tile:hover' },
  { fg: '--sg-ink', bg: '--sg-tile-press', min: 4.5, where: '.tile:active' },
  { fg: '--sg-ink', bg: '--sg-row-hover', min: 4.5, where: '.tree-row:hover' },
  { fg: '--sg-ink', bg: '--sg-row-focus', min: 4.5, where: '.tree-row.is-focused' },
  { fg: '--sg-ink', bg: '--sg-tint', min: 4.5, where: '.hero-drop.is-dragging' },
  { fg: '--sg-ink', bg: '--sg-info-bg', min: 4.5, where: '.notice (info)' },
  { fg: '--sg-ink', bg: '--sg-warn-bg', min: 4.5, where: '.notice-warn' },
  { fg: '--sg-ink', bg: '--sg-error-bg', min: 4.5, where: '.notice-error' },
  { fg: '--sg-ink', bg: '--sg-ok-bg', min: 4.5, where: '.notice-success' },
  // Muted text: hints, intros, chips, tree hints, subheaders, captions.
  { fg: '--sg-muted', bg: '--sg-desk', min: 4.5, where: '.sg-hint / .wizard-intro / .wizard-nav-hint / .sg-empty / .step-tile (future) / .app-footer' },
  { fg: '--sg-muted', bg: '--sg-paper', min: 4.5, where: '.sg-header-tagline / .tree-hint / .tree-subheader / .tree-count / .choose-preview-status' },
  { fg: '--sg-muted', bg: '--sg-tile', min: 4.5, where: '.chip / .tile-choice-desc' },
  { fg: '--sg-muted', bg: '--sg-tile-hover', min: 4.5, where: '.chip:hover' },
  { fg: '--sg-muted', bg: '--sg-row-hover', min: 4.5, where: '.tree-hint inside .tree-row:hover' },
  { fg: '--sg-muted', bg: '--sg-row-focus', min: 4.5, where: '.tree-hint inside .tree-row.is-focused' },
  // Links.
  { fg: '--sg-link', bg: '--sg-desk', min: 4.5, where: 'a / .disclosure-btn' },
  { fg: '--sg-link', bg: '--sg-paper', min: 4.5, where: '.skip-link / .tree-title:hover' },
  { fg: '--sg-link', bg: '--sg-row-hover', min: 4.5, where: '.disclosure-btn:hover' },
  { fg: '--sg-link-hover', bg: '--sg-desk', min: 4.5, where: 'a:hover' },
  { fg: '--sg-link-hover', bg: '--sg-paper', min: 4.5, where: 'a:hover on a sheet' },
  // Tiles.
  { fg: '--sg-tile-primary-fg', bg: '--sg-tile-primary', min: 4.5, where: '.tile-primary / .step.is-current' },
  { fg: '--sg-tile-primary-fg', bg: '--sg-tile-primary-hover', min: 4.5, where: '.tile-primary:hover' },
  { fg: '--sg-tile-primary-fg', bg: '--sg-tile-primary-press', min: 4.5, where: '.tile-primary:active' },
  { fg: '--sg-accent', bg: '--sg-paper', min: 4.5, where: '.tile-secondary (light) / .step.is-done' },
  { fg: '--sg-accent', bg: '--sg-tile', min: 4.5, where: '.tile-secondary (dark) / .tile-choice-media .bi' },
  { fg: '--sg-accent', bg: '--sg-tile-hover', min: 4.5, where: '.tile-secondary:hover' },
  { fg: '--sg-accent', bg: '--sg-tile-press', min: 4.5, where: '.tile-secondary:active / .step.is-done:active' },
  { fg: '--sg-accent', bg: '--sg-tint', min: 4.5, where: '.tile[aria-pressed=true] / .pos-badge / .hero-feature-icon (icon, so 4.5 is more than the 3 required)' },
  { fg: '--sg-accent-fg', bg: '--sg-accent', min: 4.5, where: '.tile-choice-check / .step.is-done .step-badge / .hero-step-badge' },
  // Inert tiles stay focusable and carry the "what unlocks this" hint, so their label is text.
  { fg: '--sg-tile-disabled-fg', bg: '--sg-tile-disabled', min: 4.5, where: '.tile[aria-disabled]' },
  // Notice icons.
  { fg: '--sg-info-icon', bg: '--sg-info-bg', min: 3, where: '.notice-icon (info)' },
  { fg: '--sg-warn-icon', bg: '--sg-warn-bg', min: 3, where: '.notice-icon (warn)' },
  { fg: '--sg-error-icon', bg: '--sg-error-bg', min: 3, where: '.notice-icon (error)' },
  { fg: '--sg-ok-icon', bg: '--sg-ok-bg', min: 3, where: '.notice-icon (success)' },
  // Control boundaries (1.4.11).
  { fg: '--sg-border-strong', bg: '--sg-desk', min: 3, where: '.form-control / .chip / .sg-empty / .sg-progress-track / .tile-choice (unchecked) borders on the desk' },
  { fg: '--sg-border-strong', bg: '--sg-paper', min: 3, where: '.sg-sheet-dashed / .form-check-input (tree) / .sg-header-hairline' },
  { fg: '--sg-border-strong', bg: '--sg-tile', min: 3, where: '.tile-choice (unchecked) border on its own fill' },
  { fg: '--sg-border-strong', bg: '--sg-row-hover', min: 3, where: '.form-check-input inside .tree-row:hover' },
  { fg: '--sg-border-strong', bg: '--sg-row-focus', min: 3, where: '.form-check-input inside .tree-row.is-focused' },
  { fg: '--sg-accent', bg: '--sg-desk', min: 3, where: '.tile-secondary / .tile-choice[aria-checked] / .step.is-done borders; .hero-drop.is-dragging' },
  { fg: '--sg-accent', bg: '--sg-row-focus', min: 3, where: '.form-check-input:checked inside .tree-row.is-focused' },
  { fg: '--sg-accent', bg: '--sg-row-hover', min: 3, where: '.form-check-input:checked inside .tree-row:hover' },
  { fg: '--sg-accent', bg: '--sg-rule-track', min: 3, where: '.sg-progress-fill on .sg-progress-track' },
  { fg: '--sg-accent', bg: '--sg-tile', min: 3, where: 'checked box fill vs unchecked box fill' },
  // Switch thumbs (svg fills in app.css) on the track.
  { fg: '#64748b', bg: '--sg-tile', min: 3, where: 'switch thumb (unchecked, light)' },
  { fg: '--sg-accent-fg', bg: '--sg-accent', min: 3, where: 'switch thumb (checked)' },
  // The hero motif: the shield on the sheet and its wave on the shield.
  { fg: '--sg-hero-shield', bg: '--sg-paper', min: 3, where: 'HeroArt shield on the drop sheet' },
  { fg: '--sg-hero-wave', bg: '--sg-hero-shield', min: 3, where: 'HeroArt wave on the shield' },
  // Focus ring (3 px, offset 2 px): the adjacent color is the surface the control sits on.
  { fg: '--sg-focus', bg: '--sg-desk', min: 3, where: ':focus-visible on the desk' },
  { fg: '--sg-focus', bg: '--sg-paper', min: 3, where: ':focus-visible on paper' },
  { fg: '--sg-focus', bg: '--sg-tile', min: 3, where: ':focus-visible on a tile' },
  { fg: '--sg-focus', bg: '--sg-row-hover', min: 3, where: ':focus-visible inside .tree-row:hover' },
  { fg: '--sg-focus', bg: '--sg-row-focus', min: 3, where: ':focus-visible inside .tree-row.is-focused' },
  { fg: '--sg-focus', bg: '--sg-tint', min: 3, where: ':focus-visible on .hero-drop.is-dragging' },
  { fg: '--sg-focus', bg: '--sg-info-bg', min: 3, where: 'Dismiss tile inside an info notice' },
  { fg: '--sg-focus', bg: '--sg-warn-bg', min: 3, where: 'Dismiss tile inside a warn notice' },
  { fg: '--sg-focus', bg: '--sg-error-bg', min: 3, where: 'Dismiss tile inside an error notice' },
  { fg: '--sg-focus', bg: '--sg-ok-bg', min: 3, where: 'a success notice' },
];
for (const k of KINDS) {
  PAIRS.push(
    { fg: `--sg-kind-${k}-fg`, bg: `--sg-kind-${k}-bg`, min: 4.5, where: `.kind-tag.kind-${k} / .chip[aria-pressed=true].kind-${k}` },
    { fg: `--sg-kind-${k}-fg`, bg: '--sg-tile', min: 4.5, where: `.chip[aria-pressed=true].kind-${k} .chip-count` },
    { fg: `--sg-kind-${k}-border`, bg: '--sg-desk', min: 3, where: `.chip[aria-pressed=true].kind-${k} border on the desk` },
  );
}

/** The dark switch thumb is a different svg fill (app.css). */
function fgFor(mode: 'light' | 'dark', fg: string): string {
  return mode === 'dark' && fg === '#64748b' ? '#8b95a1' : fg;
}

describe('design tokens: contrast in light and dark (DESIGN.md §9a)', () => {
  for (const [mode, tokens] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    it(`${mode}: every text pair ≥ 4.5:1 and every boundary ≥ 3:1`, () => {
      const failures: string[] = [];
      for (const p of PAIRS) {
        const fg = fgFor(mode, p.fg);
        const r = ratio(color(tokens, fg), color(tokens, p.bg));
        if (r < p.min) failures.push(`${r.toFixed(2)}:1 < ${p.min}:1 for ${fg} on ${p.bg} — ${p.where}`);
      }
      expect(failures).toEqual([]);
    });
  }

  it('the light blues are never used as text on white', () => {
    // Text tokens resolve to navy or ink in light mode, never to a secondary blue.
    for (const t of ['--sg-accent', '--sg-link', '--sg-link-hover', '--sg-ink', '--sg-muted', '--sg-tile-primary-fg']) {
      expect(['#6bc4e8', '#3cb4e5']).not.toContain(LIGHT.get(t)?.toLowerCase());
    }
    // In dark mode navy is never text: the accent is a light blue there.
    expect(DARK.get('--sg-accent')?.toLowerCase()).not.toBe('#003764');
    expect(DARK.get('--sg-link')?.toLowerCase()).not.toBe('#003764');
  });
});

// ---------------------------------------------------------------------------
// Static rules
// ---------------------------------------------------------------------------

function lineOf(text: string, idx: number): number {
  return text.slice(0, idx).split('\n').length;
}

/** The selector list that owns the declaration at `idx`. */
function selectorAt(text: string, idx: number): string {
  const open = text.lastIndexOf('{', idx);
  const prevClose = Math.max(text.lastIndexOf('}', open), text.lastIndexOf('*/', open));
  return text.slice(prevClose + 1, open).trim();
}

describe('stylesheets: focus, motion, layering, hit areas (DESIGN.md §9a, §10)', () => {
  it('never removes the focus indicator except for pointer focus (:not(:focus-visible))', () => {
    const offenders: string[] = [];
    for (const [f, text] of Object.entries(allCss)) {
      for (const m of text.matchAll(/outline\s*:\s*(none|0)\b/g)) {
        const sel = selectorAt(text, m.index ?? 0);
        if (!sel.includes(':not(:focus-visible)')) offenders.push(`${f}:${lineOf(text, m.index ?? 0)} "${sel}"`);
      }
    }
    expect(offenders).toEqual([]);
    expect(appCss).toMatch(/:focus-visible\s*\{[^}]*outline:\s*var\(--sg-focus-width\) solid var\(--sg-focus\)/);
  });

  it('keeps every duration ≤ 200 ms and zeroes motion under prefers-reduced-motion', () => {
    for (const [f, text] of Object.entries(allCss)) {
      for (const m of text.matchAll(/(\d+)ms/g)) {
        expect(Number(m[1]), `${f}:${lineOf(text, m.index ?? 0)} ${m[0]}`).toBeLessThanOrEqual(200);
      }
    }
    const reduced = appCss.slice(appCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/--sg-motion-fast:\s*0ms/);
    expect(reduced).toMatch(/--sg-motion:\s*0ms/);
    expect(reduced).toMatch(/transition:\s*none !important/);
    expect(reduced).toMatch(/animation:\s*none !important/);
  });

  it('has no sticky or fixed chrome in the shell that could cover a focused element (2.4.11)', () => {
    expect(appCss).not.toMatch(/position\s*:\s*(sticky|fixed)/);
    // The step-2 preview column is sticky inside its own grid column and can never overlap the tree.
    expect(stepCss['src/steps/ChooseStep/choose.css']).toMatch(/@media \(min-width: 992px\)[\s\S]*\.choose-preview\s*\{[^}]*position:\s*sticky/);
  });

  it('gives the 40 px chip a 44 px hit box that belongs to the button, and the tree checkbox a 44 px label', () => {
    expect(tokensCss).toMatch(/--sg-chip:\s*2\.5rem/);
    expect(tokensCss).toMatch(/--sg-tile-sm:\s*2\.75rem/);
    const chip = appCss.match(/\.chip \{[^}]*\}/)?.[0] ?? '';
    expect(chip).toMatch(/position:\s*relative/);
    expect(chip).toMatch(/min-height:\s*var\(--sg-chip\)/);
    const halo = appCss.match(/\.chip::before \{[^}]*\}/)?.[0] ?? '';
    expect(halo).toMatch(/content:\s*''/);
    expect(halo).toMatch(/position:\s*absolute/);
    expect(halo).toMatch(/inset:\s*-2px/);
    const check = appCss.match(/\.tree-check \{[^}]*\}/)?.[0] ?? '';
    expect(check).toMatch(/width:\s*var\(--sg-tile-sm\)/);
    expect(check).toMatch(/height:\s*var\(--sg-tile-sm\)/);
  });

  it('keeps inert tiles inert on hover (the rule comes after every variant) and unchecked choice cards bounded', () => {
    const disabledHover = appCss.indexOf(".tile[aria-disabled='true']:hover");
    expect(disabledHover).toBeGreaterThan(appCss.indexOf('.tile-primary:hover'));
    expect(disabledHover).toBeGreaterThan(appCss.indexOf('.tile-ghost:hover'));
    const rule = appCss.slice(disabledHover, appCss.indexOf('}', disabledHover));
    expect(rule).toMatch(/box-shadow:\s*none/);
    expect(rule).toMatch(/transform:\s*none/);
    const choice = appCss.match(/\.tile-choice \{[^}]*\}/)?.[0] ?? '';
    expect(choice).toMatch(/--tile-border:\s*var\(--sg-border-strong\)/);
  });

  it('sets the column heading weight itself so <h3> and <legend> match', () => {
    const rule = appCss.match(/\.wizard-col-title \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/font-weight:\s*700/);
    expect(rule).toMatch(/float:\s*none/);
    expect(rule).toMatch(/font-family:\s*var\(--sg-font-ui\)/);
  });
});
