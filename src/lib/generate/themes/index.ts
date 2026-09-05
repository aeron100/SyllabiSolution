/**
 * Theme registry: composes base + presentation + print into one stylesheet
 * string that the assembler inlines into the document's <style>.
 *
 * Two presentations (DESIGN.md §8): Original keeps the instructor's inline
 * formatting; Styled applies one clean layout in a named five-role palette.
 */
import type { PaletteId, Presentation } from '../../types';
import { DEFAULT_PALETTE, getPalette } from '../colors';
import { BASE_CSS } from './base';
import { ORIGINAL_CSS } from './original';
import { PRINT_CSS_ORIGINAL, PRINT_CSS_STYLED, printCss } from './print';
import { MUTED_INK, STYLED_FONT_STACK, gridColor, paletteVars, styledCss } from './styled';

export { BASE_CSS, ORIGINAL_CSS, PRINT_CSS_ORIGINAL, PRINT_CSS_STYLED, printCss };
export { MUTED_INK, STYLED_FONT_STACK, gridColor, paletteVars, styledCss };

/**
 * Full stylesheet (screen + print) for a presentation. Pure; same input →
 * same string. The palette is ignored for Original and defaults to
 * DEFAULT_PALETTE for Styled; an unknown id resolves to the default.
 */
export function themeCss(presentation: Presentation, palette?: PaletteId): string {
  if (presentation === 'original') return `${BASE_CSS}\n${ORIGINAL_CSS}\n${PRINT_CSS_ORIGINAL}`;
  return `${BASE_CSS}\n${styledCss(getPalette(palette ?? DEFAULT_PALETTE))}\n${PRINT_CSS_STYLED}`;
}
