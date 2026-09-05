import type { Palette, PaletteRole } from '../../lib/types';

export interface SwatchProps {
  palette: Palette;
  size?: 'md' | 'lg';
  className?: string;
}

const ROLES: readonly PaletteRole[] = ['primary', 'secondary', 'accent', 'tint', 'paper'];

/**
 * A palette as a small stack of its five color bars (DESIGN.md §8).
 * Decorative: the palette name beside it carries the meaning.
 */
export function Swatch({ palette, size = 'md', className = '' }: SwatchProps) {
  return (
    <span className={`swatch ${size === 'lg' ? 'swatch-lg' : ''} ${className}`.trim()} aria-hidden="true">
      {ROLES.map((role) => (
        <span key={role} className={`swatch-bar swatch-${role}`} style={{ background: palette[role] }} />
      ))}
    </span>
  );
}
