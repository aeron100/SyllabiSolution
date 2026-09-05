export type StepNumber = 1 | 2 | 3 | 4;

export const STEP_LABELS: Record<StepNumber, string> = {
  1: 'Upload',
  2: 'Choose pages',
  3: 'Arrange and style',
  4: 'Finalize',
};

const STEP_NUMBERS: readonly StepNumber[] = [1, 2, 3, 4];

export interface StepStripProps {
  current: StepNumber;
  /** Highest step reached so far; every other step up to it is a jump button. */
  maxReached: number;
  onJump: (step: StepNumber) => void;
}

/**
 * The four-step path (DESIGN.md §10 "Step strip"): 1 Upload, 2 Choose pages,
 * 3 Arrange and style, 4 Finalize. Current = accent fill + aria-current="step".
 * Completed = check + hidden "completed", rendered as a button that jumps
 * back. Future = plain text. A decorative hairline rule beneath shows progress.
 */
export function StepStrip({ current, maxReached, onJump }: StepStripProps) {
  const progress = ((current - 1) / (STEP_NUMBERS.length - 1)) * 100;
  return (
    <nav aria-label="Steps" className="step-strip">
      <ol className="step-strip-list">
        {STEP_NUMBERS.map((n) => {
          const isCurrent = n === current;
          const isDone = !isCurrent && n <= maxReached;
          const label = STEP_LABELS[n];
          const cls = `step${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}`;
          const inner = (
            <>
              <span className="step-badge" aria-hidden="true">
                {isDone ? <i className="bi bi-check-lg step-check" /> : n}
              </span>
              <span className="visually-hidden">Step {n}{isDone ? ', completed' : ''}: </span>
              <span className="step-label">{label}</span>
            </>
          );
          return (
            <li key={n} className={cls} aria-current={isCurrent ? 'step' : undefined}>
              {isDone ? (
                <button type="button" className="step-tile" onClick={() => onJump(n)}>
                  {inner}
                </button>
              ) : (
                <span className="step-tile">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="step-rule" aria-hidden="true">
        <div className="step-rule-fill" style={{ width: `${progress}%` }} />
      </div>
    </nav>
  );
}
