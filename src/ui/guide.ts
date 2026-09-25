/**
 * "Guide me" (DESIGN.md §10): what the guide card says on each step, worked
 * out from the app's state. Pure, so which lines show and which are ticked
 * can be tested without rendering. A task is ticked only when the app can
 * see it done; what happens in Canvas or the print window never is.
 */
import type { Kind } from '../lib/types';
import { GUIDE } from './copy';
import { KIND_PLURAL } from './kinds';

export type GuideStep = 1 | 2 | 3 | 4;

/** Where "Show me" goes: a control on the current step, found inside <main>. */
export interface GuideTarget {
  /** CSS selector; the first match is scrolled into view and focused. */
  selector: string;
  /** Completes the button's name after "Show me", e.g. "the cover form". */
  name: string;
}

export interface GuideTask {
  id: string;
  text: string;
  /** Ticked. Only ever true for something the app can see. */
  done: boolean;
  target?: GuideTarget;
}

export interface GuideTip {
  text: string;
  target?: GuideTarget;
}

export interface GuideContent {
  title: string;
  tasks: GuideTask[];
  tip?: GuideTip;
}

/** What the guide can see. Everything is read from the app's state; nothing is tracked for the guide alone. */
export interface GuideFacts {
  /** Pages checked. */
  selected: number;
  /** A page from the Canvas Syllabus tab is among them. */
  syllabusChecked: boolean;
  /** A page has been previewed on step 2. */
  previewed: boolean;
  /** Kinds in the export that Content types is hiding, in chip order. */
  hiddenKinds: readonly Kind[];
  /** The cover's instructor name is filled in. */
  instructor: boolean;
  /** Print / PDF export was pressed for the current document. */
  printed: boolean;
  /** Entries in the report's "Still needs you" list; null before a document exists. */
  todo: number | null;
  /** Chrome or Edge, whose print window the step-4 lines name. */
  chromium: boolean;
}

/** Show me targets. Each selector is checked against the rendered steps in test/ui/app.test.tsx. */
export const GUIDE_TARGETS = {
  chooseFile: { selector: '.hero-actions .tile', name: 'Choose a file' },
  pageList: { selector: '.choose-tree-pane input[type="checkbox"]', name: 'the page list' },
  pageTitle: { selector: '.choose-tree-pane .tree-title', name: 'a page title' },
  contentTypes: { selector: '[aria-controls="choose-kinds-panel"]', name: 'Content types' },
  look: { selector: '.arrange-look-grid [role="radio"][aria-checked="true"]', name: 'the looks' },
  order: { selector: '.card-list .card-row', name: 'Your syllabus' },
  cover: { selector: '#arrange-instructor', name: 'the cover form' },
  print: { selector: '.download-primary', name: 'Print / PDF export' },
  report: { selector: '[aria-controls="download-report-todo"]', name: 'the report' },
} as const satisfies Record<string, GuideTarget>;

/** The guide card for one step. */
export function guideFor(step: GuideStep, f: GuideFacts): GuideContent {
  switch (step) {
    case 1: {
      const g = GUIDE.upload;
      return {
        title: g.title,
        tasks: [
          { id: 'open', text: g.open, done: false },
          { id: 'create', text: g.create, done: false },
          { id: 'download', text: g.download, done: false },
          { id: 'choose', text: g.choose, done: false, target: GUIDE_TARGETS.chooseFile },
        ],
        tip: { text: g.tip },
      };
    }
    case 2: {
      const g = GUIDE.choose;
      return {
        title: g.title,
        tasks: [
          {
            id: 'check',
            text: f.syllabusChecked ? `${g.check} ${g.syllabusChecked}` : g.check,
            done: f.selected > 0,
            target: GUIDE_TARGETS.pageList,
          },
          { id: 'preview', text: g.preview, done: f.previewed, target: GUIDE_TARGETS.pageTitle },
          { id: 'next', text: g.next, done: false },
        ],
        tip:
          f.hiddenKinds.length > 0
            ? { text: g.hidden(f.hiddenKinds.map((k) => KIND_PLURAL[k])), target: GUIDE_TARGETS.contentTypes }
            : { text: g.tip },
      };
    }
    case 3: {
      const g = GUIDE.arrange;
      const tasks: GuideTask[] = [{ id: 'look', text: g.look, done: false, target: GUIDE_TARGETS.look }];
      // One page has no order to check.
      if (f.selected > 1) tasks.push({ id: 'order', text: g.order, done: false, target: GUIDE_TARGETS.order });
      tasks.push(
        { id: 'cover', text: g.cover, done: f.instructor, target: GUIDE_TARGETS.cover },
        { id: 'generate', text: g.generate, done: false },
      );
      return { title: g.title, tasks, tip: { text: g.tip } };
    }
    case 4: {
      const g = GUIDE.finalize;
      let tip: GuideTip | undefined;
      if (f.todo !== null) tip = f.todo > 0 ? { text: g.todo(f.todo), target: GUIDE_TARGETS.report } : { text: g.clean };
      return {
        title: g.title,
        tasks: [
          { id: 'print', text: g.print, done: f.printed, target: GUIDE_TARGETS.print },
          { id: 'destination', text: f.chromium ? g.destination : g.destinationOther, done: false },
          { id: 'headers', text: f.chromium ? g.headers : g.headersOther, done: false },
          { id: 'save', text: g.save, done: false },
        ],
        tip,
      };
    }
  }
}
