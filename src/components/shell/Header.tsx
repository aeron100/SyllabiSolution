import type { ReactNode } from 'react';
import { VisuallyHidden } from '../ui/VisuallyHidden';
import { LOGO_DATA_URI } from '../../ui/assets';

export interface HeaderProps {
  /** Right slot, e.g. a "Start over" secondary tile. */
  children?: ReactNode;
  /** Wrap the logo in a link (opens in a new tab so in-progress work is kept). Omit for a plain image. */
  logoHref?: string;
  tagline?: string;
  appName?: string;
}

/**
 * The institution header (DESIGN.md §10 "Institution header"): Coastline
 * College logo, a vertical hairline, then "Institutional Effectiveness" in
 * letter-spaced small caps over the app name in the display serif. The app
 * name is the page's one <h1>; step headings are <h2> under it.
 * A banner landmark. Not sticky, so it never covers a focused element.
 */
export function Header({ children, logoHref, tagline = 'Institutional Effectiveness', appName = 'Syllabus Generator' }: HeaderProps) {
  const logo = (
    <span className="sg-logo-plate">
      <img src={LOGO_DATA_URI} alt="Coastline College" className="sg-header-logo" height={44} width={166} decoding="async" />
    </span>
  );
  return (
    <header role="banner" className="sg-header">
      <div className="sg-header-inner">
        <div className="sg-header-brand">
          {logoHref ? (
            <a href={logoHref} className="sg-header-logo-link" target="_blank" rel="noopener noreferrer">
              {logo}
              <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
            </a>
          ) : (
            logo
          )}
          <span className="sg-header-hairline" aria-hidden="true" />
          <div className="sg-header-text">
            <p className="sg-header-tagline sg-smallcaps">{tagline}</p>
            <h1 className="sg-header-name">{appName}</h1>
          </div>
        </div>
        {children && <div className="sg-header-slot">{children}</div>}
      </div>
    </header>
  );
}
