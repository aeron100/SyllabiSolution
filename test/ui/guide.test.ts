/**
 * "Guide me" content (DESIGN.md §10): which lines each step's guide card
 * shows and which are ticked, from the facts the app can see. A task is
 * ticked only for something the app can observe; what happens in Canvas or
 * in the print window never is. The Show me selectors are checked against
 * the rendered steps in app.test.tsx.
 */
import { describe, expect, it } from 'vitest';
import { GUIDE } from '../../src/ui/copy';
import { GUIDE_TARGETS, guideFor, type GuideFacts } from '../../src/ui/guide';

const FACTS: GuideFacts = {
  selected: 0,
  syllabusChecked: false,
  previewed: false,
  hiddenKinds: [],
  instructor: false,
  printed: false,
  todo: null,
  chromium: true,
};

function facts(patch: Partial<GuideFacts>): GuideFacts {
  return { ...FACTS, ...patch };
}

function ticked(step: 1 | 2 | 3 | 4, f: GuideFacts): string[] {
  return guideFor(step, f)
    .tasks.filter((t) => t.done)
    .map((t) => t.id);
}

describe('guideFor', () => {
  it('step 1 walks the Canvas export and ticks nothing, since it all happens in Canvas', () => {
    const g = guideFor(1, FACTS);
    expect(g.title).toBe(GUIDE.upload.title);
    expect(g.tasks.map((t) => t.id)).toEqual(['open', 'create', 'download', 'choose']);
    expect(g.tasks.every((t) => !t.done)).toBe(true);
    // Only the last line is on this page, so only it has Show me.
    expect(g.tasks.filter((t) => t.target).map((t) => t.target)).toEqual([GUIDE_TARGETS.chooseFile]);
    expect(g.tip).toEqual({ text: GUIDE.upload.tip });
  });

  it('step 2 ticks a checked page and a preview, and names the syllabus only while it is checked', () => {
    expect(ticked(2, FACTS)).toEqual([]);
    expect(ticked(2, facts({ selected: 1 }))).toEqual(['check']);
    expect(ticked(2, facts({ selected: 3, previewed: true }))).toEqual(['check', 'preview']);
    // "Click Next" is never ticked: pressing it leaves the step.
    expect(guideFor(2, facts({ selected: 3, previewed: true })).tasks.find((t) => t.id === 'next')?.done).toBe(false);

    const check = (f: GuideFacts) => guideFor(2, f).tasks[0].text;
    expect(check(facts({ selected: 1, syllabusChecked: true }))).toBe(`${GUIDE.choose.check} ${GUIDE.choose.syllabusChecked}`);
    expect(check(facts({ selected: 1 }))).toBe(GUIDE.choose.check);
  });

  it('step 2 points at Content types when a kind is hidden, naming up to three, else reassures', () => {
    const tip = (hiddenKinds: GuideFacts['hiddenKinds']) => guideFor(2, facts({ hiddenKinds })).tip;
    expect(tip([])).toEqual({ text: GUIDE.choose.tip });
    expect(tip(['file'])).toEqual({ text: 'Some content is hidden: Files. Open Content types to show it.', target: GUIDE_TARGETS.contentTypes });
    expect(tip(['assignment', 'quiz', 'file'])?.text).toBe('Some content is hidden: Assignments, Quizzes, Files. Open Content types to show it.');
    expect(tip(['assignment', 'quiz', 'discussion', 'file'])?.text).toBe(
      'Some content is hidden, such as Assignments and Quizzes. Open Content types to show it.',
    );
  });

  it('step 3 asks for an order only when there is more than one page, and ticks the cover once a name is in', () => {
    expect(guideFor(3, facts({ selected: 1 })).tasks.map((t) => t.id)).toEqual(['look', 'cover', 'generate']);
    expect(guideFor(3, facts({ selected: 2 })).tasks.map((t) => t.id)).toEqual(['look', 'order', 'cover', 'generate']);
    expect(ticked(3, facts({ selected: 2 }))).toEqual([]);
    expect(ticked(3, facts({ selected: 2, instructor: true }))).toEqual(['cover']);
    expect(guideFor(3, FACTS).tip).toEqual({ text: GUIDE.arrange.tip });
  });

  it('step 4 ticks Print once pressed and names the Chrome and Edge print window only there', () => {
    expect(ticked(4, facts({ todo: 0 }))).toEqual([]);
    expect(ticked(4, facts({ todo: 0, printed: true }))).toEqual(['print']);
    const lines = (chromium: boolean) => guideFor(4, facts({ chromium })).tasks.map((t) => t.text);
    expect(lines(true)).toEqual([GUIDE.finalize.print, GUIDE.finalize.destination, GUIDE.finalize.headers, GUIDE.finalize.save]);
    expect(lines(false)).toEqual([GUIDE.finalize.print, GUIDE.finalize.destinationOther, GUIDE.finalize.headersOther, GUIDE.finalize.save]);
  });

  it('step 4 sends the user to the report when it has entries and stays honest when it has none', () => {
    expect(guideFor(4, FACTS).tip).toBeUndefined();
    expect(guideFor(4, facts({ todo: 0 })).tip).toEqual({ text: GUIDE.finalize.clean });
    expect(guideFor(4, facts({ todo: 1 })).tip).toEqual({
      text: 'The report below lists 1 thing only you can fix. Fix it in Canvas, then export again.',
      target: GUIDE_TARGETS.report,
    });
    expect(guideFor(4, facts({ todo: 3 })).tip?.text).toBe('The report below lists 3 things only you can fix. Fix them in Canvas, then export again.');
  });

  it('keeps every line short: one or two plain sentences (DESIGN.md §10 "One sentence, then a link")', () => {
    const all = ([1, 2, 3, 4] as const).flatMap((step) => {
      const g = guideFor(step, facts({ selected: 2, syllabusChecked: true, hiddenKinds: ['file'], todo: 2 }));
      return [...g.tasks.map((t) => t.text), g.tip?.text ?? ''];
    });
    for (const line of all.filter(Boolean)) {
      expect(line.length, line).toBeLessThanOrEqual(140);
      expect(line.split(/(?<=[.!?])\s/).length, line).toBeLessThanOrEqual(2);
    }
  });
});
