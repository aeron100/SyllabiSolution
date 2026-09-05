export interface LiveRegionProps {
  /** The current status message. Empty string clears the region. */
  message: string;
  /** Use "assertive" only for errors that must interrupt. */
  politeness?: 'polite' | 'assertive';
  id?: string;
}

/**
 * A visually-hidden live region for status messages (WCAG 4.1.3).
 * Mount it once, early, and change `message` to announce; focus never moves.
 */
export function LiveRegion({ message, politeness = 'polite', id }: LiveRegionProps) {
  return (
    <div id={id} className="visually-hidden" aria-live={politeness} aria-atomic="true" role={politeness === 'assertive' ? 'alert' : 'status'}>
      {message}
    </div>
  );
}
