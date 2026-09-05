import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type TileVariant = 'primary' | 'secondary' | 'ghost';
export type TileSize = 'lg' | 'md' | 'sm';

export interface TileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = accent fill; secondary = paper fill + accent border; ghost = quiet. */
  variant?: TileVariant;
  /** lg = 56 px (primary actions), md = 48 px (secondary), sm = 44 px (minimum). */
  size?: TileSize;
  /** Bootstrap Icons class, e.g. "bi-download". Decorative; always pair with a label. */
  icon?: string;
  /** Put the icon after the label (e.g. "Next" with an arrow). */
  iconEnd?: boolean;
  /** Full width. */
  block?: boolean;
  /** Icon-only square tile. Provide aria-label. */
  iconOnly?: boolean;
  children?: ReactNode;
}

/**
 * A Metro-style tile button (DESIGN.md §10 "Tiles, not buttons").
 * Opaque fill, bold label, one icon, glass sheen. type="button" by default.
 * Pass aria-pressed for toggles; the stylesheet styles [aria-pressed="true"].
 */
export const Tile = forwardRef<HTMLButtonElement, TileProps>(function Tile(
  { variant = 'secondary', size = 'md', icon, iconEnd = false, block = false, iconOnly = false, className = '', type = 'button', children, ...rest },
  ref,
) {
  const classes = ['tile', `tile-${variant}`, `tile-${size}`, block ? 'tile-block' : '', iconOnly ? 'tile-icon-only' : '', className]
    .filter(Boolean)
    .join(' ');
  const iconEl = icon ? <i className={`bi ${icon}`} aria-hidden="true" /> : null;
  return (
    <button ref={ref} type={type} className={classes} {...rest}>
      {!iconEnd && iconEl}
      {children !== undefined && children !== null && <span className="tile-label">{children}</span>}
      {iconEnd && iconEl}
    </button>
  );
});
