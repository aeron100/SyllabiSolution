import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { TileSize, TileVariant } from './Tile';
import { VisuallyHidden } from './VisuallyHidden';

export interface TileLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /** Same variants as Tile. */
  variant?: TileVariant;
  /** Same sizes as Tile. */
  size?: TileSize;
  /** Bootstrap Icons class, e.g. "bi-file-earmark-pdf". Decorative; always pair with a label. */
  icon?: string;
  /** Open in a new tab (so in-progress work is kept) and say so to assistive technology. */
  newTab?: boolean;
  children: ReactNode;
}

/**
 * A link that looks like a Tile, for navigation (a document, another site)
 * where a button would be the wrong element. Same classes as Tile, so it
 * lifts, presses, and focuses the same way.
 */
export function TileLink({ variant = 'secondary', size = 'md', icon, newTab = false, className = '', children, ...rest }: TileLinkProps) {
  const classes = ['tile', `tile-${variant}`, `tile-${size}`, className].filter(Boolean).join(' ');
  const tab = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <a className={classes} {...tab} {...rest}>
      {icon && <i className={`bi ${icon}`} aria-hidden="true" />}
      <span className="tile-label">{children}</span>
      {newTab && <VisuallyHidden> (opens in a new tab)</VisuallyHidden>}
    </a>
  );
}
