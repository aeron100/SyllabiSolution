/**
 * Generation module public API. Implemented in assemble.ts / themes/.
 * See DESIGN.md §7–§8. The assembled HTML must contain NO JavaScript.
 */
import type { AssembledDoc, PaletteId, Presentation, SyllabusDoc } from '../types';
import { assembleDocument as assemble } from './assemble';
import { themeCss as css } from './themes';

/** Assemble a SyllabusDoc into one self-contained HTML document. Pure and deterministic. */
export function assembleDocument(doc: SyllabusDoc): AssembledDoc {
  return assemble(doc);
}

/**
 * Full stylesheet (screen + print) for a presentation. The palette is
 * ignored for Original and defaults to DEFAULT_PALETTE for Styled.
 */
export function themeCss(presentation: Presentation, palette?: PaletteId): string {
  return css(presentation, palette);
}

/** Final no-JavaScript guard for an HTML fragment; also applied to every section by assembleDocument. */
export { guardHtml } from './guard';

/** The ten palettes (generated from Tailwind scales), the default, and the shared ink colour. */
export { DEFAULT_PALETTE, INK, PALETTES, getPalette } from './colors';

/** WCAG colour arithmetic, for swatch checks in the app. */
export { contrastRatio, mixHex, relativeLuminance } from './contrast';
