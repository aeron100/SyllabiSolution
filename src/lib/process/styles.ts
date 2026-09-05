/**
 * Step 5e: presentation switch (DESIGN.md §6e).
 *
 * original — inline formatting kept (style, width/height, font, align…);
 *            class, id, data attributes and role stripped; low contrast reported.
 * neutral  — meaning-carrying styles translated to elements/classes, then
 *            every style, class, id, width, height, font and center removed.
 */
import {
  addClass, blockify, BLOCK_TAGS, elements, isBlock, isBoldWeight, isElement, isEmptyBlock, isMath,
  percentOf, pxOf, rename, reverseElements, styleOf, textOf, unwrap, fontSizePx,
} from './dom';
import type { Reporter } from './report';

/** Content width the themes lay out to; pixel image widths become a share of it. */
const CONTENT_WIDTH_PX = 700;

const NEUTRAL_KEEP: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'data-sg-width']), // data-sg-width becomes width="NN%" below
  td: new Set(['colspan', 'rowspan', 'scope', 'headers']),
  th: new Set(['colspan', 'rowspan', 'scope', 'headers', 'abbr']),
  ol: new Set(['start', 'reversed', 'type']),
  li: new Set(['value']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  time: new Set(['datetime']),
  blockquote: new Set(['cite']),
  q: new Set(['cite']),
};
const NEUTRAL_KEEP_ALL = new Set(['lang', 'dir']);

export interface Variants {
  original: string;
  neutral: string;
}

export function buildVariants(root: Element, sectionId: string, rep: Reporter): Variants {
  const original = root.cloneNode(true) as Element;
  const neutral = root.cloneNode(true) as Element;
  finishOriginal(original, sectionId, rep);
  finishNeutral(neutral, sectionId);
  return { original: original.innerHTML, neutral: neutral.innerHTML };
}

// ---------------------------------------------------------------------------
// Shared attribute policy
// ---------------------------------------------------------------------------

/** Only our own anchors survive: heading ids and the table header-cell ids `headers` points at. */
function keepId(value: string, sectionId: string): boolean {
  return value.startsWith(sectionId + '-h') || value.startsWith(sectionId + '-t');
}

function keepClasses(el: Element): void {
  const own = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.startsWith('sg-'));
  if (own.length) el.setAttribute('class', own.join(' '));
  else el.removeAttribute('class');
}

function stripOriginal(root: Element, sectionId: string): void {
  for (const el of elements(root, '*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      if (name === 'class') keepClasses(el);
      else if (name === 'id') {
        if (!keepId(attr.value, sectionId)) el.removeAttribute(name);
      } else if (name.startsWith('data-') || name.startsWith('aria-') || name === 'role' || name === 'hidden' || name === 'loading') {
        el.removeAttribute(name);
      }
    }
  }
}

function stripNeutral(root: Element, sectionId: string): void {
  for (const el of elements(root, '*')) {
    if (isMath(el)) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === 'class' || attr.name === 'id' || attr.name === 'style' || attr.name === 'href') el.removeAttribute(attr.name);
      }
      continue;
    }
    const keep = NEUTRAL_KEEP[el.localName];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      if (name === 'class') keepClasses(el);
      else if (name === 'id') {
        if (!keepId(attr.value, sectionId)) el.removeAttribute(name);
      } else if (NEUTRAL_KEEP_ALL.has(name) || (keep && keep.has(name))) {
        // keep
      } else {
        el.removeAttribute(name);
      }
    }
  }
}

/** Attribute-less <span>/<font> wrappers mean nothing; attribute-less <div> becomes flow. */
function unwrapBareWrappers(root: Element): void {
  for (const el of reverseElements(root, 'span, font')) {
    if (el.attributes.length === 0) unwrap(el);
  }
  for (const el of reverseElements(root, 'div')) {
    // bare, or carrying only our own alignment classes
    const own = Array.from(el.attributes);
    if (own.some((a) => a.name !== 'class')) continue;
    const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (isEmptyBlock(el)) {
      el.remove();
      continue;
    }
    const hasBlocks = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.localName));
    if (hasBlocks) {
      const blocks = blockify(el);
      for (const b of blocks) if (isElement(b)) for (const c of classes) addClass(b, c);
      el.replaceWith(...blocks);
    } else {
      rename(el, 'p');
    }
  }
}

// ---------------------------------------------------------------------------
// Original
// ---------------------------------------------------------------------------

function finishOriginal(root: Element, sectionId: string, rep: Reporter): void {
  stripOriginal(root, sectionId);
  unwrapBareWrappers(root);
  reportLowContrast(root, rep);
}

// ---------------------------------------------------------------------------
// Neutral
// ---------------------------------------------------------------------------

function finishNeutral(root: Element, sectionId: string): void {
  translateStyles(root);
  stripNeutral(root, sectionId);
  // The share of the content width travels as a percentage `width` attribute
  // (browsers map it to the dimension property), so the neutral variant
  // carries no inline style at all (DESIGN.md §6e).
  for (const el of reverseElements(root, 'img[data-sg-width]')) {
    el.setAttribute('width', el.getAttribute('data-sg-width') + '%');
    el.removeAttribute('data-sg-width');
  }
  for (const el of reverseElements(root, 'font')) unwrap(el);
  for (const el of reverseElements(root, 'center')) {
    const blocks = Array.from(el.children).filter((c) => BLOCK_TAGS.has(c.localName));
    if (blocks.length) {
      for (const b of blocks) addClass(b, 'sg-center');
      el.replaceWith(...blockify(el));
    } else {
      const p = rename(el, 'p');
      addClass(p, 'sg-center');
    }
  }
  unwrapBareWrappers(root);
}

/** Wrap an element's inline content in `tag`; for block containers, wrap each block child instead. */
function wrapContent(el: Element, tag: string): void {
  const doc = el.ownerDocument;
  const blocks = Array.from(el.children).filter((c) => BLOCK_TAGS.has(c.localName));
  if (blocks.length) {
    for (const b of blocks) if (!isEmptyBlock(b) || textOf(b)) wrapContent(b, tag);
    return;
  }
  if (!el.childNodes.length) return;
  const w = doc.createElement(tag);
  while (el.firstChild) w.appendChild(el.firstChild);
  el.appendChild(w);
}

function translateStyles(root: Element): void {
  for (const el of reverseElements(root, '*')) {
    if (isMath(el)) continue;
    const tag = el.localName;
    if (tag === 'b') {
      rename(el, 'strong');
      continue;
    }
    if (tag === 'i') {
      rename(el, 'em');
      continue;
    }
    if (tag === 'strike') {
      rename(el, 's');
      continue;
    }

    const st = styleOf(el);
    if (st.size) {
      const wraps: string[] = [];
      const heading = /^h[1-6]$/.test(tag);
      if (isBoldWeight(st.get('font-weight')) && !heading && tag !== 'strong' && tag !== 'th') wraps.push('strong');
      if (/^(?:italic|oblique)/i.test(st.get('font-style') ?? '') && tag !== 'em') wraps.push('em');
      const deco = `${st.get('text-decoration') ?? ''} ${st.get('text-decoration-line') ?? ''}`;
      if (/\bunderline\b/i.test(deco) && tag !== 'u' && tag !== 'a') wraps.push('u');
      if (/\bline-through\b/i.test(deco) && tag !== 's') wraps.push('s');
      // first listed ends up outermost: <strong><em>…</em></strong>
      for (const w of wraps.reverse()) wrapContent(el, w);
    }

    const align = (st.get('text-align') ?? el.getAttribute('align') ?? '').toLowerCase();
    if (align && isBlock(el) && tag !== 'img') {
      if (align === 'center') addClass(el, 'sg-center');
      else if (align === 'right') addClass(el, 'sg-right');
    }

    if (tag === 'img') {
      const pct = percentOf(el.getAttribute('width')) ?? percentOf(st.get('width'));
      const px = pxOf(el.getAttribute('width')) ?? pxOf(st.get('width'));
      const share = pct ?? (px !== null ? Math.round((px / CONTENT_WIDTH_PX) * 100) : null);
      if (share !== null) el.setAttribute('data-sg-width', String(Math.min(100, Math.max(1, share))));
    }
  }
}

// ---------------------------------------------------------------------------
// Contrast (Original only — themes pass AA by construction)
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

const NAMED: Record<string, Rgb> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], lime: [0, 255, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], cyan: [0, 255, 255], aqua: [0, 255, 255], magenta: [255, 0, 255], fuchsia: [255, 0, 255],
  silver: [192, 192, 192], gray: [128, 128, 128], grey: [128, 128, 128], maroon: [128, 0, 0], olive: [128, 128, 0],
  green: [0, 128, 0], purple: [128, 0, 128], teal: [0, 128, 128], navy: [0, 0, 128], orange: [255, 165, 0],
  pink: [255, 192, 203], brown: [165, 42, 42], gold: [255, 215, 0], darkblue: [0, 0, 139], darkgreen: [0, 100, 0],
  darkred: [139, 0, 0], lightgray: [211, 211, 211], lightgrey: [211, 211, 211], darkgray: [169, 169, 169],
  darkgrey: [169, 169, 169], lightblue: [173, 216, 230], lightgreen: [144, 238, 144], lightyellow: [255, 255, 224],
  beige: [245, 245, 220], ivory: [255, 255, 240], crimson: [220, 20, 60], indigo: [75, 0, 130], violet: [238, 130, 238],
  tomato: [255, 99, 71], coral: [255, 127, 80], salmon: [250, 128, 114], khaki: [240, 230, 140], tan: [210, 180, 140],
  chocolate: [210, 105, 30], firebrick: [178, 34, 34], forestgreen: [34, 139, 34], royalblue: [65, 105, 225],
  steelblue: [70, 130, 180], slategray: [112, 128, 144], slategrey: [112, 128, 144], dimgray: [105, 105, 105],
  dimgrey: [105, 105, 105], whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220], lavender: [230, 230, 250],
};

export function parseColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v in NAMED) return NAMED[v];
  let m = v.match(/^#([0-9a-f]{3,4})$/);
  if (m) {
    const h = m[1];
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  m = v.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/);
  if (m) return [clamp(Number(m[1])), clamp(Number(m[2])), clamp(Number(m[3]))];
  return null;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** First color-looking token in a `background` shorthand. */
function backgroundColor(st: Map<string, string>): string | null {
  const direct = st.get('background-color');
  if (direct) return direct;
  const short = st.get('background');
  if (!short) return null;
  const m = short.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b[a-z]+\b/i);
  return m ? m[0] : null;
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Page defaults for the Original look: a locked white page (themes/original.ts) and browser-default black text. */
const PAPER: Rgb = [255, 255, 255];
const INK: Rgb = [0, 0, 0];

/** An element's own text colour: inline style, else the legacy `color` attribute (<font color>). */
function ownColor(el: Element): string | null {
  return styleOf(el).get('color') ?? el.getAttribute('color');
}

/** An element's own background: inline style, else the legacy `bgcolor` attribute (<td bgcolor>). */
function ownBackground(el: Element): string | null {
  return backgroundColor(styleOf(el)) ?? el.getAttribute('bgcolor');
}

function nearestStyle(el: Element, prop: 'color' | 'background', root: Element): string | null {
  for (let a: Element | null = el; a; a = a.parentElement) {
    const v = prop === 'color' ? ownColor(a) : ownBackground(a);
    if (v) return v;
    if (a === root) break;
  }
  return null;
}

function isLargeText(el: Element, root: Element): boolean {
  let size: number | null = null;
  let bold = false;
  for (let a: Element | null = el; a; a = a.parentElement) {
    const st = styleOf(a);
    if (size === null) size = fontSizePx(st.get('font-size'));
    if (!bold && (isBoldWeight(st.get('font-weight')) || a.localName === 'strong' || a.localName === 'b' || /^h[1-3]$/.test(a.localName))) bold = true;
    if (a === root) break;
  }
  if (size === null) size = /^h[1-3]$/.test(el.localName) ? 24 : 16;
  return size >= 24 || (size >= 18.66 && bold);
}

function hasOwnText(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === 3 && textOf(n) !== '') || (textOf(el) !== '' && !Array.from(el.children).some(isBlock));
}

/**
 * Every element that sets a colour or a background is checked against the
 * nearest declared counterpart, or the page default when none is declared
 * (light text on the white page is the common failure). A declared colour
 * that cannot be parsed (var(), gradients…) is skipped, never guessed.
 */
export function reportLowContrast(root: Element, rep: Reporter): void {
  for (const el of elements(root, '[style], [color], [bgcolor]')) {
    if (!isElement(el) || isMath(el)) continue;
    if (!ownColor(el) && !ownBackground(el)) continue;
    if (!hasOwnText(el)) continue;
    const fgRaw = nearestStyle(el, 'color', root);
    const bgRaw = nearestStyle(el, 'background', root);
    const fg = fgRaw ? parseColor(fgRaw) : INK;
    const bg = bgRaw ? parseColor(bgRaw) : PAPER;
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    const threshold = isLargeText(el, root) ? 3 : 4.5;
    if (ratio < threshold) {
      rep.add('low-contrast', 1, `${fgRaw ?? 'default text'} on ${bgRaw ?? 'the page'} (${ratio.toFixed(1)}:1)`);
      rep.notice('low-contrast');
    }
  }
}
