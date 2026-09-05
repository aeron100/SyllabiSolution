import { forwardRef, type KeyboardEventHandler, type ReactNode } from 'react';

export interface ChoiceTileProps {
  title: string;
  description?: string;
  checked: boolean;
  onSelect: () => void;
  /** A Swatch or any decorative preview; rendered in the media slot. */
  swatch?: ReactNode;
  /** Bootstrap Icons class, shown in the media slot when there is no swatch. */
  icon?: string;
  /** Roving tabindex, managed by the parent radiogroup (0 for the active item, -1 otherwise). */
  tabIndex?: number;
  /** Arrow-key handling lives in the parent; it is forwarded here. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  id?: string;
  className?: string;
}

/**
 * A selectable card with role="radio". Place inside an element with
 * role="radiogroup" and an accessible name. The parent owns roving
 * tabindex and arrow keys; Space/Enter select via the native button click.
 * Selected = 3 px accent border + a check in the corner slot.
 */
export const ChoiceTile = forwardRef<HTMLButtonElement, ChoiceTileProps>(function ChoiceTile(
  { title, description, checked, onSelect, swatch, icon, tabIndex, onKeyDown, id, className = '' },
  ref,
) {
  const media = swatch ?? (icon ? <i className={`bi ${icon}`} aria-hidden="true" /> : null);
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onClick={onSelect}
      className={`tile tile-choice ${className}`.trim()}
    >
      {media && <span className="tile-choice-media">{media}</span>}
      <span className="tile-choice-body">
        <span className="tile-choice-title">{title}</span>
        {description && <span className="tile-choice-desc">{description}</span>}
      </span>
      <span className="tile-choice-check" aria-hidden="true">
        <i className="bi bi-check-lg" />
      </span>
    </button>
  );
});
