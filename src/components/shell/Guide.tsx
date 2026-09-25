import { useRef } from 'react';
import { Tile } from '../ui/Tile';
import { VisuallyHidden } from '../ui/VisuallyHidden';
import { GUIDE } from '../../ui/copy';
import type { GuideContent, GuideTarget } from '../../ui/guide';

export interface GuideProps {
  /** The wizard step, for ids and for where focus goes when the guide is hidden. */
  step: number;
  content: GuideContent;
  /** Turn guide mode off (the same state as the header's Guide me toggle). */
  onHide: () => void;
}

/**
 * Bring a Show me target into view and focus it. Focus moved by script after
 * a click does not always draw the focus ring, so a data attribute draws it
 * (a class could be dropped by a re-render) until focus leaves the target.
 * The scroll is instant under reduced motion.
 */
function showTarget(scope: ParentNode, target: GuideTarget): void {
  const el = scope.querySelector<HTMLElement>(target.selector);
  if (!el) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  el.setAttribute('data-guided', '');
  el.addEventListener('blur', () => el.removeAttribute('data-guided'), { once: true });
}

/**
 * The guide card (DESIGN.md §10 "Guide me"): a sheet in the step's own flow,
 * right under the heading, so it never covers a control. A numbered list of
 * what to do on this step, ticked as the app sees each one done, with a Show
 * me tile beside the tasks that point at a control, and one tip. Hiding it
 * turns guide mode off and moves focus to the step heading.
 */
export function Guide({ step, content, onHide }: GuideProps) {
  const ref = useRef<HTMLElement>(null);
  const titleId = `guide-${step}-title`;

  const show = (target: GuideTarget): void => {
    const scope = ref.current?.closest('main') ?? document;
    showTarget(scope, target);
  };

  const hide = (): void => {
    document.getElementById(`wizard-step-${step}-heading`)?.focus();
    onHide();
  };

  const showMe = (target: GuideTarget) => (
    <Tile variant="ghost" size="sm" icon="bi-hand-index" className="guide-show" onClick={() => show(target)}>
      {GUIDE.showMe}
      <VisuallyHidden> {target.name}</VisuallyHidden>
    </Tile>
  );

  return (
    <section ref={ref} className="guide sg-sheet" aria-labelledby={titleId}>
      <div className="guide-head">
        <i className="bi bi-signpost-2 guide-icon" aria-hidden="true" />
        <div className="guide-heading">
          <p className="guide-kicker sg-smallcaps">{GUIDE.kicker}</p>
          <h3 id={titleId} className="guide-title">
            {content.title}
          </h3>
        </div>
        <Tile variant="ghost" size="sm" icon="bi-x-lg" iconOnly aria-label={GUIDE.hide} className="guide-hide" onClick={hide} />
      </div>
      {/* role="list" is explicit: with list-style none, WebKit drops the role from an unmarked list. */}
      <ol className="guide-tasks" role="list">
        {content.tasks.map((task, i) => (
          <li key={task.id} className={`guide-task${task.done ? ' is-done' : ''}`}>
            <span className="guide-mark tnum" aria-hidden="true">
              {task.done ? <i className="bi bi-check-lg" /> : i + 1}
            </span>
            <p className="guide-text">
              {task.done && <VisuallyHidden>{GUIDE.done}</VisuallyHidden>}
              {task.text}
            </p>
            {task.target && showMe(task.target)}
          </li>
        ))}
      </ol>
      {content.tip && (
        <div className="guide-tip">
          <i className="bi bi-lightbulb guide-tip-icon" aria-hidden="true" />
          <p className="guide-text">{content.tip.text}</p>
          {content.tip.target && showMe(content.tip.target)}
        </div>
      )}
    </section>
  );
}
