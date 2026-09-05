import type { ReactNode, Ref } from 'react';
import { Tile } from '../ui/Tile';

export interface WizardNavBack {
  label: string;
  onClick: () => void;
}

export interface WizardNavNext {
  label: string;
  onClick: () => void;
  /** When true the tile is inert (aria-disabled, still focusable) and the hint is shown beside it. */
  disabled?: boolean;
  /** One sentence saying what unlocks Next, e.g. "Check at least one page." */
  hint?: string;
  /** Default true: accent fill, 56 px. False renders a secondary tile. */
  primary?: boolean;
  /** Bootstrap Icons class; defaults to an arrow. */
  icon?: string;
}

export interface WizardFrameProps {
  step: number;
  title: string;
  /** One line under the heading. */
  intro?: ReactNode;
  children: ReactNode;
  back?: WizardNavBack;
  next?: WizardNavNext;
  /** Focus this heading whenever the step changes. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Extra content in the nav bar between Back and Next (e.g. "7 selected"). */
  aside?: ReactNode;
  /** A small-caps line above the heading (the hero's "Print-ready in four steps"). */
  kicker?: ReactNode;
  /**
   * Full-bleed band (the hero). When given, the kicker, heading, intro and
   * this content render in a `.wizard-band` that spans the whole width of
   * <main> — a normal block, no viewport-width tricks — above the
   * max-width `.wizard` container that holds the body and the nav. The
   * content sits in a `.wizard-band-aside` beside the title block (a
   * text | aside grid from 992 px, stacked below).
   */
  band?: ReactNode;
  /** Applied to the `.wizard` container (the body's column). */
  className?: string;
}

/**
 * One wizard step (DESIGN.md §10 "Flow"): a labelled section with a
 * focusable <h2>, an intro line, the nav bar (Back left, Next right)
 * directly under the heading, the body, and the same nav bar again at the
 * foot. Both bars are in normal flow, never sticky.
 * When Next is disabled the hint sits beside it and is linked with
 * aria-describedby, so the reason is always available.
 *
 * With `band` (the hero), the section becomes a `.wizard-shell` holding a
 * full-width `.wizard-band` (kicker, heading, intro, band content, inside a
 * `.wizard-band-inner` with the wizard's max-width and padding) and then the
 * `.wizard` container. The heading keeps its id, ref and tabIndex, so focus
 * management and aria-labelledby work the same in both layouts.
 */
export function WizardFrame({ step, title, intro, children, back, next, headingRef, aside, kicker, band, className = '' }: WizardFrameProps) {
  const headingId = `wizard-step-${step}-heading`;
  const hintId = `wizard-step-${step}-next-hint`;
  const nextDisabled = next?.disabled === true;
  const showHint = nextDisabled && Boolean(next?.hint);
  const head = (
    <>
      {kicker && <p className="wizard-kicker sg-smallcaps">{kicker}</p>}
      <h2 id={headingId} className="wizard-title" tabIndex={-1} ref={headingRef}>
        {title}
      </h2>
      {intro && <p className="wizard-intro">{intro}</p>}
    </>
  );
  const body = <div className="wizard-body">{children}</div>;
  /**
   * The nav bar renders twice — under the heading and at the foot of the
   * step — so Back/Next are in view both before and after a long body. The
   * two copies carry identical names and actions; only the hint ids differ.
   */
  const renderNav = (position: 'top' | 'bottom') => {
    if (!(back || next || aside)) return null;
    const id = `${hintId}-${position}`;
    return (
      <div className={`wizard-nav wizard-nav-${position}`}>
        <div className="wizard-nav-back">
          {back && (
            <Tile variant="secondary" size="md" icon="bi-arrow-left" onClick={back.onClick}>
              {back.label}
            </Tile>
          )}
        </div>
        {aside && <div className="wizard-nav-aside">{aside}</div>}
        {next && (
          <div className="wizard-nav-next">
            {showHint && (
              <p id={id} className="wizard-nav-hint">
                {next.hint}
              </p>
            )}
            <Tile
              variant={next.primary === false ? 'secondary' : 'primary'}
              size="lg"
              icon={next.icon ?? 'bi-arrow-right'}
              iconEnd
              aria-disabled={nextDisabled || undefined}
              aria-describedby={showHint ? id : undefined}
              onClick={(e) => {
                if (nextDisabled) {
                  e.preventDefault();
                  return;
                }
                next.onClick();
              }}
            >
              {next.label}
            </Tile>
          </div>
        )}
      </div>
    );
  };
  const navTop = renderNav('top');
  const navBottom = renderNav('bottom');
  if (band) {
    return (
      <section className="wizard-shell" aria-labelledby={headingId}>
        <div className="wizard-band">
          <div className="wizard-band-inner">
            <div className="wizard-band-head">{head}</div>
            <div className="wizard-band-aside">{band}</div>
          </div>
        </div>
        <div className={`wizard wizard-step ${className}`.trim()}>
          {navTop}
          {body}
          {navBottom}
        </div>
      </section>
    );
  }
  return (
    <section className={`wizard wizard-step ${className}`.trim()} aria-labelledby={headingId}>
      <div className="wizard-head">{head}</div>
      {navTop}
      {body}
      {navBottom}
    </section>
  );
}
