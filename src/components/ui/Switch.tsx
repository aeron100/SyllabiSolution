export interface SwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** One short sentence under the label. */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A 44 px switch row: native checkbox with role="switch", a visible label,
 * and an optional hint linked by aria-describedby.
 */
export function Switch({ id, label, checked, onChange, hint, disabled = false, className = '' }: SwitchProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={`switch-row ${className}`.trim()}>
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
    </div>
  );
}
