import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import type { Cartridge, Kind } from '../../lib/types';
import { WizardFrame } from '../../components/shell';
import { Disclosure, LiveRegion } from '../../components/ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { KIND_PLURAL } from '../../ui/kinds';
import { treeOrder, visibleIds } from '../../ui/tree';
import ContentTree from './ContentTree';
import FilterChips, { kindsPresent } from './FilterChips';
import PreviewSheet from './PreviewSheet';
import ShownToolbar from './ShownToolbar';
import './choose.css';

export interface ChooseStepProps {
  cart: Cartridge;
  /** Selected resource ids in document order: position 1 first. Rows show that position as a badge. */
  selected: readonly string[];
  onToggle: (id: string, on: boolean) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
  /** Kinds hidden by the filter chips. Selections of hidden kinds are kept. */
  hiddenKinds: Set<Kind>;
  onToggleKind: (kind: Kind, hidden: boolean) => void;
  /** The item shown in the preview. */
  focusedId?: string;
  onFocus: (id: string) => void;
  /** Complete HTML document for the sandboxed preview frame (see src/ui/preview.ts). */
  previewSrcdoc?: string;
  previewTitle?: string;
  previewLoading?: boolean;
  /** One sentence when the preview could not be built. */
  previewError?: string;
  /** Resources per kind in the export; only kinds with a count get a chip. */
  counts: Partial<Record<Kind, number>>;
  /** Wizard navigation. Omit either to hide that tile. */
  onBack?: () => void;
  onNext?: () => void;
  /** Focus target when the step changes (WizardFrame moves focus to the heading). */
  headingRef?: Ref<HTMLHeadingElement>;
}

const WIDE_QUERY = '(min-width: 992px)';
/** The stacked layout: picking a title also brings the preview sheet into view. */
export const NARROW_QUERY = '(max-width: 991.98px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const NEXT_HINT = 'Choose at least one page to continue.';
export const KINDS_PANEL_ID = 'choose-kinds-panel';
export const PREVIEW_HINT_WIDE = 'Click a page on the left to preview its content.';
export const PREVIEW_HINT_NARROW = 'Click a page above to preview its content.';
/** Clearance kept above a pressed row when the preview is brought up under it: its focus ring (3 px, 2 px out) and a little air. */
const ROW_CLEARANCE_PX = 12;

function pages(n: number): string {
  return n === 1 ? 'page' : 'pages';
}

/** True when the query matches right now; false where matchMedia is missing (jsdom, SSR). */
function media(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/**
 * Step 2 — Choose pages (DESIGN.md §10). Left column, top to bottom: the
 * "Content types" disclosure (kind chips, collapsed by default), the shown
 * toolbar, then the pages pane — a scrollable sheet holding the content
 * tree. Right column: the preview, sticky on wide screens so it stays put
 * while the tree scrolls. Under 992 px the columns stack in the same order
 * and picking a title scrolls the preview sheet into view. Next stays inert
 * with a hint until at least one page is checked. `selected` is the ordered
 * list step 3 rearranges, so a checked row's badge is its document position.
 */
export default function ChooseStep({
  cart,
  selected,
  onToggle,
  onToggleMany,
  hiddenKinds,
  onToggleKind,
  focusedId,
  onFocus,
  previewSrcdoc,
  previewTitle,
  previewLoading = false,
  previewError,
  counts,
  onBack,
  onNext,
  headingRef,
}: ChooseStepProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [status, setStatus] = useState('');
  const announcedFor = useRef<string | undefined>(undefined);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const order = useMemo(() => treeOrder(cart), [cart]);
  // 1-based document position per selected id; the single source of truth is the ordered list.
  const positions = useMemo(() => {
    const m = new Map<string, number>();
    selected.forEach((id) => {
      if (!m.has(id)) m.set(id, m.size + 1);
    });
    return m;
  }, [selected]);
  const shownIds = useMemo(() => visibleIds(cart, order, hiddenKinds), [cart, order, hiddenKinds]);
  const shownChecked = useMemo(() => shownIds.filter((id) => positions.has(id)).length, [shownIds, positions]);
  const kinds = useMemo(() => kindsPresent(counts), [counts]);
  const kindsShown = kinds.filter((k) => !hiddenKinds.has(k)).length;

  // Announce once per previewed item, not on every re-render of its srcdoc.
  useEffect(() => {
    if (!previewSrcdoc || !previewTitle || !focusedId) return;
    if (announcedFor.current === focusedId) return;
    announcedFor.current = focusedId;
    setStatus(`Preview ready: ${previewTitle}.`);
  }, [previewSrcdoc, previewTitle, focusedId]);

  const selectShown = (): void => {
    const adding = shownIds.length - shownChecked;
    if (adding <= 0) return;
    onToggleMany(shownIds, true);
    const total = positions.size + adding;
    setStatus(`All ${shownIds.length} shown ${pages(shownIds.length)} checked. ${total} selected in all.`);
  };

  const clearShown = (): void => {
    if (shownChecked === 0) return;
    onToggleMany(shownIds, false);
    const total = Math.max(0, positions.size - shownChecked);
    setStatus(`Shown ${pages(shownIds.length)} cleared. ${total} selected in all.`);
  };

  const toggleKind = (kind: Kind, hidden: boolean): void => {
    onToggleKind(kind, hidden);
    setStatus(hidden ? `${KIND_PLURAL[kind]} hidden. Checked ones stay checked.` : `${KIND_PLURAL[kind]} shown.`);
  };

  /**
   * One row checked or unchecked. The checkbox's own name changes to say its
   * new position, but a name change on the focused control is not read out,
   * so the status line says where the page landed — or, after an uncheck,
   * that the pages after it moved up and how many are left (DESIGN.md §10).
   */
  const toggle = (id: string, on: boolean, title: string): void => {
    onToggle(id, on);
    const was = positions.get(id);
    if (on) {
      const total = was === undefined ? positions.size + 1 : positions.size;
      setStatus(`${title} checked, position ${was ?? total} of ${total}.`);
      return;
    }
    const left = was === undefined ? positions.size : positions.size - 1;
    const renumbered = was !== undefined && was < positions.size;
    setStatus(`${title} unchecked${renumbered ? '; later pages renumbered' : ''}. ${left} selected.`);
  };

  /**
   * A title was picked. On a stacked (narrow) layout the preview sits below
   * the pane, so bring its sheet into view; focus stays on the title button
   * the user pressed. The pane and the sheet together can be taller than the
   * viewport, and then aligning the sheet's bottom edge with the viewport's
   * would push the pressed row (still focused) above the top edge — so the
   * page scrolls only as far as keeps that row in view. Never on wide
   * screens, where the preview is already beside the tree and sticky.
   */
  const pick = (id: string, source?: HTMLElement): void => {
    onFocus(id);
    if (!media(NARROW_QUERY)) return;
    const sheet = sheetRef.current;
    if (!sheet || typeof sheet.scrollIntoView !== 'function') return;
    const behavior: ScrollBehavior = media(REDUCED_MOTION_QUERY) ? 'auto' : 'smooth';
    const row = source?.closest<HTMLElement>('.tree-row');
    if (row && typeof window.scrollBy === 'function') {
      const overshoot = sheet.getBoundingClientRect().bottom - window.innerHeight; // what "nearest" would scroll by
      const room = row.getBoundingClientRect().top - ROW_CLEARANCE_PX; // the most the row can move up
      if (overshoot > room) {
        window.scrollBy({ top: Math.max(0, room), behavior });
        return;
      }
    }
    sheet.scrollIntoView({ block: 'nearest', behavior });
  };

  const count = positions.size;

  return (
    <WizardFrame
      step={2}
      title="Choose pages"
      intro="Check the pages you want in your syllabus. Click a page to preview its content."
      headingRef={headingRef}
      back={onBack ? { label: 'Back', onClick: onBack } : undefined}
      next={
        onNext
          ? { label: 'Next', onClick: onNext, disabled: count === 0, hint: NEXT_HINT, icon: 'bi-arrow-right' }
          : undefined
      }
      aside={
        <span className="wizard-nav-count tnum">
          {count} selected
        </span>
      }
    >
      <LiveRegion id="choose-status" message={status} />
      <div className="wizard-columns choose-columns">
        <div className="wizard-col choose-col-tree">
          <Disclosure id={KINDS_PANEL_ID} label="Content types" suffix={`${kindsShown} of ${kinds.length} shown`} className="choose-kinds">
            <FilterChips counts={counts} hiddenKinds={hiddenKinds} onToggleKind={toggleKind} />
          </Disclosure>
          <ShownToolbar
            shownCount={shownIds.length}
            shownChecked={shownChecked}
            selectedCount={count}
            onSelectShown={selectShown}
            onClearShown={clearShown}
          />
          {/*
           * The pages pane: a sheet that scrolls on its own. tabIndex 0 so a
           * keyboard user can scroll it even before reaching a row; role and
           * label so a screen reader can jump to it.
           */}
          <div className="sg-sheet choose-tree-pane" role="region" aria-label="Pages">
            <ContentTree
              cart={cart}
              positions={positions}
              hiddenKinds={hiddenKinds}
              focusedId={focusedId}
              onToggle={toggle}
              onToggleMany={onToggleMany}
              onFocus={pick}
            />
          </div>
        </div>
        <PreviewSheet
          srcdoc={previewSrcdoc}
          title={previewTitle}
          loading={previewLoading}
          error={previewError}
          focusedId={focusedId}
          hint={wide ? PREVIEW_HINT_WIDE : PREVIEW_HINT_NARROW}
          sheetRef={sheetRef}
        />
      </div>
    </WizardFrame>
  );
}
