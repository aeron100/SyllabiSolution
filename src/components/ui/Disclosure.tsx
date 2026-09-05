import { useState, type ReactNode } from 'react';

export interface DisclosureProps {
  /** id of the panel; the button's aria-controls points at it. */
  id: string;
  label: string;
  children: ReactNode;
  /** Uncontrolled initial state. */
  defaultOpen?: boolean;
  /** Controlled state; pair with onToggle. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Extra text after the label, e.g. a count. Read as part of the button name, after a pause ("Content types, 6 of 7 shown"). */
  suffix?: ReactNode;
  className?: string;
}

/**
 * A disclosure: a real <button aria-expanded aria-controls> and a panel.
 * No Bootstrap JS; state is React's. Works controlled or uncontrolled.
 */
export function Disclosure({ id, label, children, defaultOpen = false, open, onToggle, suffix, className = '' }: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const toggle = (): void => {
    const next = !isOpen;
    if (open === undefined) setInner(next);
    onToggle?.(next);
  };
  return (
    <div className={`disclosure ${isOpen ? 'is-open' : ''} ${className}`.trim()}>
      <button type="button" className="disclosure-btn" aria-expanded={isOpen} aria-controls={id} onClick={toggle}>
        <i className="bi bi-chevron-right disclosure-chevron" aria-hidden="true" />
        <span className="disclosure-label">{label}</span>
        {suffix !== undefined && suffix !== null && (
          <>
            {/* A spoken pause between the name and its count; the pill shows the count alone. */}
            <span className="visually-hidden">, </span>
            <span className="disclosure-suffix">{suffix}</span>
          </>
        )}
      </button>
      <div id={id} className="disclosure-panel" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
