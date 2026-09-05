import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Kind } from '../../lib/types';
import { LiveRegion, Tile } from '../../components/ui';
import { KindPill } from './KindPill';

export interface SyllabusEntry {
  id: string;
  title: string;
  kind: Kind;
}

export interface SyllabusListProps {
  entries: SyllabusEntry[];
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}

type FocusTarget = 'row' | 'up' | 'down' | 'remove' | 'empty';

interface Pending {
  id: string | null;
  target: FocusTarget;
}

export const LIST_TITLE_ID = 'arrange-list-title';
const HELP_ID = 'arrange-list-help';

export const LIST_EMPTY = 'Nothing here yet. Go back to Choose pages and check the pages you want.';
export const LIST_HELP = 'Use the buttons, or press Alt + Up or Alt + Down on a row, to change the order.';

/**
 * "Your syllabus": the ordered list of selected pages as index cards, with
 * Move up / Move down / Remove tiles and Alt+Arrow reordering (WCAG 2.2
 * 2.5.7: no dragging required). The tiles are the tab stops; a row itself is
 * focusable only programmatically or by click (tabindex -1), so a 40-page
 * list costs three stops per row, not four. Alt+Arrow works from the row or
 * from any tile in it (keydown bubbles to the row), and the hint is linked
 * to the Move tiles, where screen readers actually read it. Every move is
 * announced in a live region and focus follows the moved row.
 *
 * Each row's position badge is real text ("Position 2 of 5.": the number
 * visible, the words visually hidden) and every tile in the row is described
 * by it, so a tab stop says where its page sits without counting rows. The
 * list keeps an explicit list role because its list-style is none.
 */
export function SyllabusList({ entries, onMove, onRemove }: SyllabusListProps) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const pending = useRef<Pending | null>(null);
  const [message, setMessage] = useState('');

  // After the parent applies a move or removal, put focus back where it belongs.
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.target === 'empty') {
      emptyRef.current?.focus();
      return;
    }
    const row = p.id ? rows.current.get(p.id) : undefined;
    if (!row) return;
    const el = p.target === 'row' ? row : row.querySelector<HTMLElement>(`[data-action="${p.target}"]`);
    (el ?? row).focus();
  }, [entries]);

  // aria-atomic regions do not re-announce identical text; vary a trailing NBSP.
  const announce = (text: string): void => setMessage((prev) => (prev === text ? `${text}\u00A0` : text));

  const move = (i: number, dir: -1 | 1, target: FocusTarget): void => {
    const entry = entries[i];
    const j = i + dir;
    if (j < 0 || j >= entries.length) {
      announce(dir < 0 ? `${entry.title} is already first.` : `${entry.title} is already last.`);
      return;
    }
    pending.current = { id: entry.id, target };
    announce(`Moved ${entry.title} to position ${j + 1}.`);
    onMove(entry.id, dir);
  };

  const remove = (i: number): void => {
    const entry = entries[i];
    const neighbour = entries[i + 1] ?? entries[i - 1];
    pending.current = neighbour ? { id: neighbour.id, target: 'row' } : { id: null, target: 'empty' };
    announce(`Removed ${entry.title}.`);
    onRemove(entry.id);
  };

  // Alt+Up / Alt+Down from the row or from any of its tiles; focus returns to the same control after the move.
  const onRowKeyDown = (e: KeyboardEvent<HTMLLIElement>, i: number): void => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    const target: FocusTarget = action === 'up' || action === 'down' || action === 'remove' ? action : 'row';
    move(i, e.key === 'ArrowUp' ? -1 : 1, target);
  };

  return (
    <div className="arrange-list">
      <h3 className="wizard-col-title" id={LIST_TITLE_ID}>
        Your syllabus
      </h3>
      <LiveRegion message={message} />
      {entries.length === 0 ? (
        <p ref={emptyRef} tabIndex={-1} className="sg-empty arrange-list-empty">
          {LIST_EMPTY}
        </p>
      ) : (
        <>
          <p id={HELP_ID} className="sg-hint arrange-list-help">
            {LIST_HELP}
          </p>
          {/* role="list" is explicit: with list-style none, WebKit drops the role from an unmarked list, and VoiceOver's "2 of 5" with it. */}
          <ol className="card-list" role="list" aria-labelledby={LIST_TITLE_ID}>
            {entries.map((entry, i) => {
              const first = i === 0;
              const last = i === entries.length - 1;
              const posId = `arrange-pos-${i + 1}`;
              return (
                <li
                  key={entry.id}
                  className="card-row"
                  data-id={entry.id}
                  tabIndex={-1}
                  ref={(el) => {
                    if (el) rows.current.set(entry.id, el);
                    else rows.current.delete(entry.id);
                  }}
                  onKeyDown={(e) => onRowKeyDown(e, i)}
                >
                  {/*
                   * The same position badge as the rows on step 2 (.pos-badge). There the checkbox name
                   * carries the position; here the badge is the row's position text ("Position 2 of 5.")
                   * and the tiles below are described by it.
                   */}
                  <span className="card-index pos-badge tnum" id={posId}>
                    <span className="visually-hidden">Position </span>
                    {i + 1}
                    <span className="visually-hidden">{` of ${entries.length}.`}</span>
                  </span>
                  <KindPill kind={entry.kind} />
                  <span className="card-title">{entry.title}</span>
                  <span className="card-actions">
                    <Tile
                      variant="ghost"
                      size="sm"
                      icon="bi-arrow-up"
                      iconOnly
                      data-action="up"
                      aria-label={`Move up: ${entry.title}`}
                      aria-describedby={`${posId} ${HELP_ID}`}
                      aria-disabled={first || undefined}
                      onClick={() => {
                        if (!first) move(i, -1, 'up');
                      }}
                    />
                    <Tile
                      variant="ghost"
                      size="sm"
                      icon="bi-arrow-down"
                      iconOnly
                      data-action="down"
                      aria-label={`Move down: ${entry.title}`}
                      aria-describedby={`${posId} ${HELP_ID}`}
                      aria-disabled={last || undefined}
                      onClick={() => {
                        if (!last) move(i, 1, 'down');
                      }}
                    />
                    <Tile
                      variant="ghost"
                      size="sm"
                      icon="bi-x-lg"
                      iconOnly
                      data-action="remove"
                      aria-label={`Remove: ${entry.title}`}
                      aria-describedby={posId}
                      onClick={() => remove(i)}
                    />
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
