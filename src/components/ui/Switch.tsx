import type { ReactNode } from 'react';

export interface SwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** One short sentence under the label. */
  hint?: string;
  disabled?: boolean;
  className?: string;
  /** Decorative content at the end of the row, e.g. a small picture of what the switch adds. Not part of the label. */
  aside?: ReactNode;
}

/**
 * A 44 px switch row: native checkbox with role="switch", a visible label,
 * an optional hint linked by aria-describedby, and an optional aside.
 */
export function Switch({ id, label, checked, onChange, hint, disabled = false, className = '', aside }: SwitchProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const classes = ['switch-row', aside ? 'switch-row-aside' : '', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="form-check-input"
        checked={checked}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="switch-label">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="switch-hint">
          {hint}
        </p>
      )}
      {aside && <span className="switch-aside">{aside}</span>}
    </div>
  );
}
