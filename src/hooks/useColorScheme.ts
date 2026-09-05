import { useEffect } from 'react';

/**
 * Sets data-bs-theme on <html> from prefers-color-scheme and follows
 * changes. No user toggle (DESIGN.md §10 "Light and dark mode").
 */
export function useColorScheme(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      document.documentElement.setAttribute('data-bs-theme', mq.matches ? 'dark' : 'light');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}
