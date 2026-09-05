export interface ProgressBarProps {
  /** Accessible name, e.g. "Generating syllabus". Also shown as the visible caption. */
  label: string;
  value: number;
  max: number;
  /** Human reading of the value, e.g. "3 of 12 pages". Defaults to "<value> of <max>". */
  valueText?: string;
  id?: string;
  className?: string;
}

/**
 * A determinate progress bar (WAI-ARIA progressbar). Opaque accent fill on a
 * track (≥ 3:1 boundary), with the caption and count in visible text so the
 * state is never conveyed by the bar alone.
 */
export function ProgressBar({ label, value, max, valueText, id, className = '' }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = Math.round((clamped / safeMax) * 100);
  const text = valueText ?? `${clamped} of ${safeMax}`;
  return (
    <div
      id={id}
      className={`sg-progress ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
      aria-valuetext={text}
    >
      <span className="sg-progress-caption">{label}</span>
      <span className="sg-progress-track">
        <span className="sg-progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="sg-progress-text tnum">{text}</span>
    </div>
  );
}
