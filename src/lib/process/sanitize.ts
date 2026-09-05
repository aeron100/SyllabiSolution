/**
 * Step 5b: safety strip (DESIGN.md §6b).
 *
 * 1. Pre-pass on the raw (inert) DOM: replace iframes/objects/embeds that
 *    point at a web address with a link, video/audio with a "media omitted"
 *    note, drop hidden content, and count scripts and handlers.
 * 2. DOMPurify with an explicit deny-by-default allowlist, run IN_PLACE on
 *    the inert document so nothing is ever imported into the live page.
 * 3. Our own guard: no <script>, no on* attribute, no javascript:/vbscript:/
 *    data:text/html URL, and no CSS function outside a small allowlist in
 *    inline styles (url(), image-set(), expression()… all fail closed; see
 *    ../css-safety.ts, shared with the assembler's final guard).
 *
 * The same guard runs again on both output variants (assertSafe).
 */
import DOMPurify from 'dompurify';
import { isDangerousStyle, safeStyle } from '../css-safety';
import { basename, BLOCK_CONTAINERS, elements, isBlank, newInertDocument, reverseElements, styleOf, textOf } from './dom';
import type { Reporter } from './report';

export const ALLOWED_TAGS: string[] = [
  // text blocks
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'div', 'center', 'address',
  // lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // inline
  'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sup', 'sub', 'small', 'mark',
  'abbr', 'cite', 'q', 'dfn', 'kbd', 'samp', 'var', 'code', 'font', 'wbr', 'time',
  // media
  'img', 'figure', 'figcaption',
  // tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  // sectioning (unwrapped later; allowed so their content is kept in order)
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'main', 'details', 'summary',
  // MathML (kept; browsers render it natively)
  'math', 'mi', 'mn', 'mo', 'ms', 'mtext', 'mspace', 'mrow', 'mfrac', 'msqrt', 'mroot', 'msub', 'msup',
  'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mprescripts', 'none', 'mtable', 'mtr',
  'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'merror', 'mfenced', 'mlabeledtr', 'semantics',
  'annotation',
];

export const ALLOWED_ATTR: string[] = [
  'href', 'src', 'alt', 'title', 'style', 'class', 'id', 'width', 'height',
  'colspan', 'rowspan', 'scope', 'headers', 'abbr', 'span',
  'align', 'valign', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'color', 'face', 'size',
  'start', 'reversed', 'type', 'value', 'dir', 'lang', 'role', 'datetime', 'cite',
  // read by our passes, stripped from output
  'data-equation-content', 'data-sg-file',
  // MathML presentation attributes
  'xmlns', 'display', 'displaystyle', 'mathvariant', 'mathsize', 'mathcolor', 'mathbackground',
  'fence', 'stretchy', 'largeop', 'movablelimits', 'accent', 'accentunder', 'linethickness',
  'notation', 'open', 'close', 'separators', 'columnalign', 'rowalign', 'columnspan', 'lspace',
  'rspace', 'scriptlevel', 'encoding', 'symmetric', 'form', 'minsize', 'maxsize', 'depth',
  'voffset', 'columnlines', 'rowlines', 'frame', 'numalign', 'denomalign', 'bevelled', 'subscriptshift',
  'superscriptshift', 'selection', 'length',
];

/** Attributes that can carry a URL and must never hold a script or HTML payload. */
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcdoc', 'data', 'poster', 'background', 'cite', 'longdesc', 'usemap'];

const DANGEROUS_URL = /^(?:javascript|vbscript|livescript|mocha|data:text\/html|data:application)/i;

const REMOVE_WITH_CONTENT = 'script, style, link, meta, base, noscript, template, applet, input, button, select, textarea, option, optgroup, datalist, keygen, param, source, track, canvas, svg, map, area, dialog, slot, portal, frame, frameset';

/** Canvas stamps its API host on every image/link it inserts; the link pass unwraps links back to those hosts. */
const LMS_HOST_ATTRS = ['data-api-endpoint', 'data-api-returntype'];

/** Side channel out of the sanitizer: facts read from attributes that DOMPurify then strips. */
export interface SanitizeContext {
  /** Hostnames of the source LMS learned from Canvas data-api-* attributes on this page. */
  lmsHosts: Set<string>;
}

function purifier(): typeof DOMPurify {
  if (DOMPurify.isSupported) return DOMPurify;
  return DOMPurify(window);
}

/** Strip control characters and whitespace so "java\tscript:" is caught. */
function normalizeUrl(v: string): string {
  return v.replace(/[\u0000-\u0020\u007f-\u00a0\u200b-\u200f\u2028\u2029\ufeff\u3000]/g, '');
}

/**
 * Sanitize an HTML string into a detached <div> root inside an inert document.
 */
export function sanitizeHtml(html: string, rep: Reporter, ctx?: SanitizeContext): HTMLElement {
  const doc = newInertDocument(html);
  const body = doc.body ?? doc.createElement('body');
  if (ctx) learnLmsHosts(body, ctx.lmsHosts);
  prePass(body, rep);

  const root = doc.createElement('div');
  while (body.firstChild) root.appendChild(body.firstChild);

  const p = purifier();
  p.removed = [];
  p.sanitize(root, {
    IN_PLACE: true,
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    KEEP_CONTENT: true,
    SAFE_FOR_XML: true,
  });
  let scripts = 0;
  for (const entry of p.removed as Array<{ element?: Element; attribute?: Attr }>) {
    if (entry.element && entry.element.localName === 'script') scripts++;
    else if (entry.attribute && /^on/i.test(entry.attribute.name)) scripts++;
    else if (entry.attribute && DANGEROUS_URL.test(normalizeUrl(entry.attribute.value))) scripts++;
  }
  if (scripts) {
    rep.add('script-removed', scripts);
    rep.notice('interactive-removed');
  }

  guardRoot(root);
  return root;
}

/** Hostnames from Canvas data-api-endpoint / data-api-returntype attributes (read before DOMPurify strips them). */
function learnLmsHosts(body: Element, into: Set<string>): void {
  for (const el of elements(body, LMS_HOST_ATTRS.map((a) => `[${a}]`).join(', '))) {
    for (const attr of LMS_HOST_ATTRS) {
      const v = (el.getAttribute(attr) ?? '').trim();
      if (!/^https?:\/\//i.test(v)) continue;
      try {
        const host = new URL(v).hostname.toLowerCase();
        if (host) into.add(host);
      } catch {
        /* not a URL */
      }
    }
  }
}

/** Enforce the no-script rule on a DOM tree. Returns how many violations it had to fix. */
export function guardRoot(root: Element): number {
  let fixed = 0;
  for (const el of reverseElements(root, '*')) {
    const tag = el.localName;
    if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'applet' ||
        tag === 'form' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'base' ||
        tag === 'noscript' || tag === 'svg') {
      el.remove();
      fixed++;
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        fixed++;
      } else if (URL_ATTRS.includes(name) && DANGEROUS_URL.test(normalizeUrl(attr.value))) {
        el.removeAttribute(attr.name);
        fixed++;
      } else if (name === 'srcdoc' || name === 'action' || name === 'formaction') {
        el.removeAttribute(attr.name);
        fixed++;
      } else if (name === 'style') {
        const safe = safeStyle(attr.value);
        if (safe !== attr.value) {
          if (safe !== null) el.setAttribute('style', safe);
          else el.removeAttribute('style');
        }
      }
    }
  }
  return fixed;
}

/** Final assertion on an output string: throws if any JavaScript vector survived. */
export function assertSafe(html: string): void {
  if (/<script/i.test(html)) throw new Error('unsafe output: <script>');
  const doc = newInertDocument(html);
  const body = doc.body;
  const violations = countViolations(body);
  if (violations.length) throw new Error('unsafe output: ' + violations.join(', '));
}

function countViolations(root: Element): string[] {
  const out: string[] = [];
  for (const el of elements(root, '*')) {
    const tag = el.localName;
    if (['script', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea',
         'style', 'link', 'meta', 'base', 'noscript', 'svg'].includes(tag)) out.push('<' + tag + '>');
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) out.push(name);
      else if (URL_ATTRS.includes(name) && DANGEROUS_URL.test(normalizeUrl(attr.value))) out.push(name + '=' + attr.value.slice(0, 20));
      else if (name === 'style' && isDangerousStyle(attr.value)) out.push('style');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pre-pass on the raw DOM
// ---------------------------------------------------------------------------

function prePass(body: HTMLElement, rep: Reporter): void {
  const doc = body.ownerDocument;

  // Scripts, handlers and dangerous URLs: count for the report and remove.
  let scripts = 0;
  for (const el of reverseElements(body, 'script')) {
    scripts++;
    el.remove();
  }
  for (const el of elements(body, '*')) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        scripts++;
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.includes(name) && DANGEROUS_URL.test(normalizeUrl(attr.value))) {
        scripts++;
        el.removeAttribute(attr.name);
      }
    }
  }
  if (scripts) {
    rep.add('script-removed', scripts);
    rep.notice('interactive-removed');
  }

  // Hidden content is not part of what the reader sees.
  let hidden = 0;
  for (const el of reverseElements(body, '[hidden], [style]')) {
    if (!el.isConnected) continue;
    const display = styleOf(el).get('display');
    if (el.hasAttribute('hidden') || (display && display.toLowerCase() === 'none')) {
      el.remove();
      hidden++;
    }
  }
  if (hidden) rep.add('hidden-content-removed', hidden);

  // Frames and plugins: link when there is a web address, otherwise drop.
  for (const el of elements(body, 'iframe, embed, object')) {
    if (!el.isConnected) continue;
    const raw = el.getAttribute(el.localName === 'object' ? 'data' : 'src') ?? '';
    const src = normalizeUrl(raw.trim());
    if (/^https?:\/\//i.test(src)) {
      const link = rewriteEmbedUrl(src);
      const note = doc.createElement('p');
      note.setAttribute('class', 'sg-embed');
      note.appendChild(doc.createTextNode('Embedded content: '));
      const a = doc.createElement('a');
      a.setAttribute('href', link);
      a.textContent = hostnameOf(link);
      note.appendChild(a);
      replaceWithNote(el, note);
      rep.add('interactive-removed', 1, hostnameOf(link));
    } else if (el.localName === 'object' && el.childNodes.length) {
      // fallback content is meant for exactly this case
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      rep.add('interactive-stripped', 1, el.localName);
    } else {
      el.remove();
      rep.add('interactive-stripped', 1, el.localName);
    }
    rep.notice('interactive-removed');
  }

  // Forms and controls.
  const forms = elements(body, 'form').length;
  if (forms) {
    rep.add('interactive-stripped', forms, 'form');
    rep.notice('interactive-removed');
  }

  // Video and audio: a note where each was.
  for (const el of elements(body, 'video, audio')) {
    if (!el.isConnected) continue;
    const title = mediaTitle(el);
    const note = doc.createElement('p');
    note.setAttribute('class', 'sg-media');
    note.textContent = 'Media omitted: ' + title;
    replaceWithNote(el, note);
    rep.add('media-omitted', 1, title);
    rep.notice('media-omitted');
  }

  // Inline SVG drawings go (they can carry script and cannot be checked
  // safely); the loss is reported rather than silent (DESIGN.md §2.5).
  const svgs = elements(body, 'svg').filter((el) => el.isConnected && !el.parentElement?.closest('svg'));
  if (svgs.length) rep.add('inline-svg-removed', svgs.length);

  // Everything else that has no place in a document (DOMPurify would drop
  // most of these anyway; removing here also drops their text content).
  for (const el of reverseElements(body, REMOVE_WITH_CONTENT)) el.remove();
}

function mediaTitle(el: Element): string {
  const title = el.getAttribute('title') ?? el.getAttribute('aria-label');
  if (title && !isBlank(title)) return title.trim();
  const src = el.getAttribute('src') ?? el.querySelector('source[src]')?.getAttribute('src') ?? '';
  const name = basename(src);
  if (name) return name;
  return el.localName;
}

/**
 * Put a block note where an inline-ish element was, without nesting a <p>
 * inside a <p>: climb out of any non-container ancestors first.
 */
function replaceWithNote(el: Element, note: Element): void {
  let host: Element = el;
  while (host.parentElement && !BLOCK_CONTAINERS.has(host.parentElement.localName)) {
    host = host.parentElement;
  }
  if (host === el) {
    el.replaceWith(note);
    return;
  }
  el.remove();
  if (textOf(host) === '' && !host.querySelector('img')) host.replaceWith(note);
  else host.after(note);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** youtube.com/embed/<id> and youtu.be/<id> become ordinary watch links; other URLs are kept. */
export function rewriteEmbedUrl(src: string): string {
  try {
    const u = new URL(src);
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase();
    const start = u.searchParams.get('start') ?? u.searchParams.get('t');
    const watch = (id: string): string => {
      const out = new URL('https://www.youtube.com/watch');
      out.searchParams.set('v', id);
      if (start && /^\d+$/.test(start) && Number(start) > 0) out.searchParams.set('t', start);
      return out.toString();
    };
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const m = u.pathname.match(/^\/(?:embed|v|shorts)\/([^/]+)/);
      if (m) {
        if (m[1] === 'videoseries') {
          const list = u.searchParams.get('list');
          if (list) return 'https://www.youtube.com/playlist?list=' + encodeURIComponent(list);
        } else if (/^[A-Za-z0-9_-]{6,}$/.test(m[1])) {
          return watch(m[1]);
        }
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) return watch(id);
    }
    return src;
  } catch {
    return src;
  }
}
