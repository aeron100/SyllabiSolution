import { useEffect, useRef } from 'react';
import { Tile } from '../ui/Tile';
import { VisuallyHidden } from '../ui/VisuallyHidden';
import { SPLASH } from '../../ui/copy';
import { HeroArt } from './HeroArt';

export interface SplashProps {
  /** Where "Read the directions" goes (the PDF beside index.html). */
  directionsHref: string;
  /** Guide me: turn guide mode on. The parent unmounts the splash. */
  onGuide: () => void;
  /** Get started, Escape, or following the directions link. The parent unmounts the splash. */
  onDismiss: () => void;
}

/**
 * The welcome splash (DESIGN.md §10 "Welcome splash"): a sheet of paper over
 * the hero on first load, with the stacking-pages motif, one sentence, Guide
 * me (turns on the step-by-step guide) and Get started, and under them a
 * plain link to the directions PDF. A native modal <dialog>, so the page
 * behind is inert and Escape closes it; focus starts on Get started so Enter
 * or Escape both carry a returning user straight on. Following the link also
 * closes it: the PDF opens in a new tab and the app is ready when the user
 * comes back. Nothing is remembered, so it shows on every load.
 */
export function Splash({ directionsHref, onGuide, onDismiss }: SplashProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // jsdom has no showModal; the open attribute is enough to render it there.
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    startRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="splash sg-sheet"
      aria-labelledby="splash-title"
      aria-describedby="splash-text"
      onCancel={(e) => {
        // Escape: let the parent unmount it rather than leaving a closed dialog behind.
        e.preventDefault();
        onDismiss();
      }}
    >
      <HeroArt className="splash-art" />
      <p className="splash-kicker sg-smallcaps">{SPLASH.kicker}</p>
      <h2 id="splash-title" className="splash-title">
        {SPLASH.title}
      </h2>
      <p id="splash-text" className="splash-text">
        {SPLASH.text}
      </p>
      <div className="splash-actions">
        <Tile variant="primary" size="lg" icon="bi-signpost-2" onClick={onGuide}>
          {SPLASH.guide}
        </Tile>
        <Tile ref={startRef} variant="secondary" size="lg" icon="bi-arrow-right" iconEnd onClick={onDismiss}>
          {SPLASH.start}
        </Tile>
      </div>
      <p className="sg-hint">
        {SPLASH.hint}{' '}
        <a href={directionsHref} target="_blank" rel="noopener noreferrer" onClick={onDismiss}>
          {SPLASH.directions}
          <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
        </a>
      </p>
    </dialog>
  );
}
