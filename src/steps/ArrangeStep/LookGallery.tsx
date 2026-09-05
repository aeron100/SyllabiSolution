import { Fragment } from 'react';
import { useRef, type KeyboardEvent } from 'react';
import type { DocOptions, PaletteId, Presentation } from '../../lib/types';
import { DEFAULT_PALETTE, PALETTES } from '../../lib/generate/colors';
import { ChoiceTile, Swatch } from '../../components/ui';
import { PRESENTATION_DESC } from '../../ui/copy';

export interface LookGalleryProps {
  presentation: Presentation;
  palette: PaletteId;
  onOptions: (patch: Partial<DocOptions>) => void;
}

export const ORIGINAL_TITLE = 'Original';
/** §8-faithful: Original keeps their inline formatting; it never promises a Canvas look-alike (§2 principle 6). */
export const ORIGINAL_DESC = PRESENTATION_DESC.original;

/**
 * The look gallery (DESIGN.md §8, §10): a radiogroup of choice tiles.
 * Original first, then one tile per palette with its five-color swatch.
 * Roving tabindex; arrow keys move and select (WAI-ARIA radio pattern),
 * Home/End jump to the ends; Space/Enter select via the native button.
 */
export function LookGallery({ presentation, palette, onOptions }: LookGalleryProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = PALETTES.length + 1;

  const known = PALETTES.findIndex((p) => p.id === palette);
  const fallback = PALETTES.findIndex((p) => p.id === DEFAULT_PALETTE);
  const active = presentation === 'original' ? 0 : (known >= 0 ? known : fallback) + 1;

  const select = (i: number): void => {
    if (i === 0) onOptions({ presentation: 'original' });
    else onOptions({ presentation: 'styled', palette: PALETTES[i - 1].id });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number): void => {
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    select(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="arrange-look">
      <h3 className="wizard-col-title" id="arrange-look-title">
        Look
      </h3>
      <div role="radiogroup" aria-label="Look" className="tile-choice-grid arrange-look-grid">
        <ChoiceTile
          ref={(el) => {
            refs.current[0] = el;
          }}
          id="arrange-look-original"
          className="arrange-look-original"
          title={ORIGINAL_TITLE}
          description={ORIGINAL_DESC}
          icon="bi-file-earmark-richtext"
          checked={active === 0}
          tabIndex={active === 0 ? 0 : -1}
          onSelect={() => select(0)}
          onKeyDown={(e) => onKeyDown(e, 0)}
        />
        {PALETTES.map((p, k) => {
          const i = k + 1;
          // Group labels sit inside the radiogroup as plain text (not focusable);
          // the first palette of each group gets a label above it.
          const firstOfGroup = k === 0 || PALETTES[k - 1].group !== p.group;
          const label = p.group === 'institution' ? 'College colors' : 'More looks';
          return (
            <Fragment key={p.id}>
              {firstOfGroup && (
                <p className="arrange-look-group sg-smallcaps">{label}</p>
              )}
              <ChoiceTile
                ref={(el) => {
                  refs.current[i] = el;
                }}
                id={`arrange-look-${p.id}`}
                title={p.name}
                description={p.character}
                swatch={<Swatch palette={p} />}
                checked={active === i}
                tabIndex={active === i ? 0 : -1}
                onSelect={() => select(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
