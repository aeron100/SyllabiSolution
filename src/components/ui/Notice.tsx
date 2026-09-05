import { useRef, type ReactNode } from 'react';
import { Tile } from './Tile';

export type NoticeTone = 'info' | 'warn' | 'error' | 'success';

export interface NoticeProps {
  tone?: NoticeTone;
  /** One sentence in plain words. */
  children: ReactNode;
  /** When given, a Dismiss tile is shown. */
  onDismiss?: () => void;
  /** Accessible name of the Dismiss tile; include what is dismissed when several notices show. */
  dismissLabel?: string;
  /** Override the tone's default icon (Bootstrap Icons class). */
  icon?: string;
  /**
   * Make the notice a polite live region (role="status"). Off by default: a
   * notice that mounts with its text is not reliably announced anyway, and a
   * step can show several at once. Announce state changes through the app's
   * one persistent live region instead; errors are always role="alert".
   */
  live?: boolean;
  id?: string;
  className?: string;
}

const ICON: Record<NoticeTone, string> = {
  info: 'bi-info-circle-fill',
  warn: 'bi-exclamation-triangle-fill',
  error: 'bi-x-octagon-fill',
  success: 'bi-check-circle-fill',
};

/**
 * Where focus goes when a notice is dismissed: the next notice's Dismiss tile
 * in the same group, else the previous one, else the step heading. Never the
 * document body (the dismissed tile is about to leave the DOM).
 */
function focusAfterDismiss(notice: HTMLElement): void {
  const group = notice.parentElement;
  const tiles = group ? Array.from(group.querySelectorAll<HTMLElement>('.notice > .notice-dismiss')) : [];
  const i = tiles.findIndex((t) => notice.contains(t));
  const sibling = i >= 0 ? (tiles[i + 1] ?? tiles[i - 1]) : undefined;
  const scope = notice.closest('main') ?? document;
  const target = sibling ?? scope.querySelector<HTMLElement>('.wizard-title');
  target?.focus();
}

/**
 * A dismissible inline notice (DESIGN.md §14 "just-in-time").
 * role="alert" for errors, role="status" only when `live` is set, otherwise a
 * plain block. Opaque fill, colored border, icon and text so the tone is never
 * carried by color alone. Dismissing moves focus to a neighbour or the step
 * heading so keyboard users are never dropped at the top of the page.
 */
export function Notice({ tone = 'info', children, onDismiss, dismissLabel = 'Dismiss', icon, live = false, id, className = '' }: NoticeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const role = tone === 'error' ? 'alert' : live ? 'status' : undefined;
  const dismiss = (): void => {
    if (ref.current) focusAfterDismiss(ref.current);
    onDismiss?.();
  };
  return (
    <div ref={ref} id={id} className={`notice notice-${tone} ${className}`.trim()} role={role}>
      <i className={`bi ${icon ?? ICON[tone]} notice-icon`} aria-hidden="true" />
      <div className="notice-body">{typeof children === 'string' ? <p>{children}</p> : children}</div>
      {onDismiss ? (
        <Tile variant="ghost" size="sm" icon="bi-x-lg" iconOnly aria-label={dismissLabel} className="notice-dismiss" onClick={dismiss} />
      ) : (
        <span />
      )}
    </div>
  );
}
