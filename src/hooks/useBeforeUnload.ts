import { useEffect } from 'react';

/**
 * Leave-page guard (DESIGN.md §10). Armed while `armed` is true. Browsers
 * only prompt with their own wording; we cannot block or customise it.
 * This lives in the app only; the generated file has no script.
 */
export function useBeforeUnload(armed: boolean): void {
  useEffect(() => {
    if (!armed || typeof window === 'undefined') return;
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Legacy browsers need returnValue set to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [armed]);
}
