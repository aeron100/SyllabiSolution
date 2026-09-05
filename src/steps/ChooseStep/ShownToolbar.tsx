import { Tile } from '../../components/ui';

export interface ShownToolbarProps {
  /** How many rows the filter currently shows, and how many of those are checked. */
  shownCount: number;
  shownChecked: number;
  /** Everything checked, shown or hidden. */
  selectedCount: number;
  onSelectShown: () => void;
  onClearShown: () => void;
}

/**
 * The compact row directly above the page pane: "Select all shown" and
 * "Clear shown" as 44 px tiles that act on whatever the filter is showing,
 * with a quiet "N selected" count beside them. Sits outside the
 * "Content types" disclosure so it is always at hand.
 */
export default function ShownToolbar({ shownCount, shownChecked, selectedCount, onSelectShown, onClearShown }: ShownToolbarProps) {
  const canSelect = shownCount > 0 && shownChecked < shownCount;
  const canClear = shownChecked > 0;
  return (
    <div role="group" aria-label="Shown pages" className="choose-toolbar">
      <Tile
        size="sm"
        icon="bi-check2-all"
        aria-disabled={canSelect ? undefined : true}
        onClick={() => {
          if (canSelect) onSelectShown();
        }}
      >
        Select all shown
      </Tile>
      <Tile
        size="sm"
        icon="bi-dash-square"
        aria-disabled={canClear ? undefined : true}
        onClick={() => {
          if (canClear) onClearShown();
        }}
      >
        Clear shown
      </Tile>
      <span className="choose-toolbar-count tnum">{selectedCount} selected</span>
    </div>
  );
}
