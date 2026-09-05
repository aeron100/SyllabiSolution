import type { Kind } from '../../lib/types';
import { KIND_ICON, KIND_ORDER, KIND_PLURAL } from '../../ui/kinds';

export interface FilterChipsProps {
  /** Resources per kind in the whole export; only kinds with a count get a chip. */
  counts: Partial<Record<Kind, number>>;
  hiddenKinds: Set<Kind>;
  onToggleKind: (kind: Kind, hidden: boolean) => void;
}

/** The kinds that get a chip: those present in the export, in display order. */
export function kindsPresent(counts: Partial<Record<Kind, number>>): Kind[] {
  return KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0);
}

/**
 * The content-type chips (DESIGN.md §10 "Filter bar"): one 40 px pill per
 * kind present, a real toggle button with aria-pressed (state also carried by
 * a check icon, never color alone). Lives inside the "Content types"
 * disclosure; the "shown" tiles are in ShownToolbar, outside it.
 */
export default function FilterChips({ counts, hiddenKinds, onToggleKind }: FilterChipsProps) {
  const kinds = kindsPresent(counts);
  return (
    <div role="group" aria-label="Show kinds" className="chips choose-chips">
      {kinds.map((k) => {
        const on = !hiddenKinds.has(k);
        return (
          <button
            key={k}
            type="button"
            className={`chip kind-${k}`}
            aria-pressed={on}
            onClick={() => onToggleKind(k, on)}
          >
            <i className={`bi ${on ? 'bi-check-square-fill' : 'bi-square'} chip-state`} aria-hidden="true" />
            <i className={`bi ${KIND_ICON[k]}`} aria-hidden="true" />
            <span className="chip-label">{KIND_PLURAL[k]}</span>
            <span className="chip-count tnum">{counts[k]}</span>
          </button>
        );
      })}
    </div>
  );
}
