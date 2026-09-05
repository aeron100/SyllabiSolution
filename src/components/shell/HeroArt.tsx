export interface HeroArtProps {
  className?: string;
  /** CSS width; height follows the 4:3 viewBox. */
  width?: number | string;
}

/**
 * The hero motif (DESIGN.md §10 "The hero"): three sheets stacking into one
 * document, with a shield corner echoing the Coastline mark. Inline SVG,
 * no external assets. Strokes use currentColor (set to the accent on the
 * drop target); fills use the paper and tint tokens; the shield uses the
 * --sg-hero-shield / --sg-hero-wave pair (navy + light blue on light, light
 * blue + ink on dark, so it never vanishes on the sheet). Decorative.
 */
export function HeroArt({ className = '', width }: HeroArtProps) {
  const style = width !== undefined ? { width } : undefined;
  return (
    <svg
      className={`hero-art ${className}`.trim()}
      style={style}
      viewBox="0 0 160 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* Back sheet, tilted left */}
      <g transform="rotate(-8 60 64)">
        <rect x="26" y="22" width="68" height="86" rx="3" fill="var(--sg-tint)" stroke="currentColor" strokeWidth="2" />
        <path d="M36 40h44M36 50h36M36 60h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      </g>
      {/* Middle sheet, tilted right */}
      <g transform="rotate(6 84 64)">
        <rect x="50" y="18" width="68" height="86" rx="3" fill="var(--sg-tint)" stroke="currentColor" strokeWidth="2" />
        <path d="M60 36h44M60 46h32M60 56h44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      </g>
      {/* Front sheet: the assembled document */}
      <g>
        <rect x="46" y="26" width="68" height="88" rx="3" fill="var(--sg-paper)" stroke="currentColor" strokeWidth="2.5" />
        {/* Title band */}
        <rect x="56" y="38" width="36" height="6" rx="1.5" fill="currentColor" />
        {/* Body lines */}
        <path d="M56 54h48M56 63h48M56 72h38M56 84h48M56 93h30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
        {/* Shield corner: a shield with a wave, echoing the mark (themed tokens) */}
        <path d="M100 18h22v16c0 6-4.5 10.5-11 13-6.5-2.5-11-7-11-13z" fill="var(--sg-hero-shield)" stroke="var(--sg-paper)" strokeWidth="2" />
        <path d="M103 34c3-3 6-3 8 0s5 3 8 0" fill="none" stroke="var(--sg-hero-wave)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
