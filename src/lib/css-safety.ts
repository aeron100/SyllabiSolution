/**
 * Inline-style safety shared by the processing sanitizer and the assembler's
 * final guard, so the two enforcement points cannot drift (DESIGN.md §6b).
 *
 * Policy: a declaration is dropped when its value could load a remote
 * resource or run code. Rather than deny-listing url()/expression() alone,
 * every CSS function call must be on a short allowlist — image-set(),
 * image(), src(), element(), paint(), cross-fade() and anything new all fail
 * closed. No DOM, no I/O; deterministic.
 */

/** Functions that cannot fetch or execute anything. */
const SAFE_FUNCTIONS = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix',
  'calc', 'min', 'max', 'clamp', 'var', 'env',
  'rect', 'inset', 'circle', 'ellipse', 'polygon',
  'linear-gradient', 'radial-gradient', 'conic-gradient',
  'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient',
  'translate', 'translatex', 'translatey', 'scale', 'scalex', 'scaley', 'rotate', 'skew', 'skewx', 'skewy', 'matrix',
  'counter', 'counters', 'attr', 'format', 'steps', 'cubic-bezier',
]);

const DANGEROUS_TOKENS = /expression\s*\(|behavior\s*:|-moz-binding|@import|javascript:|vbscript:|\\/i;
const FUNCTION_CALL = /(-?[a-z][a-z0-9-]*)\s*\(/gi;

/** Split a style attribute into declarations, respecting parentheses and quotes. */
export function splitDeclarations(style: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of style) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (ch === ';' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** True when a single `prop: value` declaration could load a resource or run code. */
export function isDangerousDeclaration(decl: string): boolean {
  if (DANGEROUS_TOKENS.test(decl)) return true;
  // Comments can hide a function name from a naive scan: strip them first.
  const value = decl.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\/\*|\*\//.test(value)) return true; // unterminated comment
  FUNCTION_CALL.lastIndex = 0;
  for (let m = FUNCTION_CALL.exec(value); m; m = FUNCTION_CALL.exec(value)) {
    if (!SAFE_FUNCTIONS.has(m[1].toLowerCase())) return true;
  }
  return false;
}

/** True when any declaration in a style attribute is dangerous. */
export function isDangerousStyle(style: string): boolean {
  return splitDeclarations(style).some(isDangerousDeclaration);
}

/**
 * The safe declarations of a style attribute joined back together, or null
 * when nothing safe remains. Returns the input unchanged (same string) when
 * every declaration is safe, so callers can skip a rewrite.
 */
export function safeStyle(style: string): string | null {
  const decls = splitDeclarations(style);
  const safe = decls.filter((d) => !isDangerousDeclaration(d));
  if (safe.length === decls.length) return style;
  return safe.length ? safe.join('; ') : null;
}
