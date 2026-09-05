import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DownloadStep from '../../src/steps/DownloadStep';
import type { AssembledDoc, NoticeCode } from '../../src/lib/types';
import { NOTICE_COPY, NOTICE_DOWNLOAD_FIRST, NOTICE_PRINT_BROWSER, STATUS } from '../../src/ui/copy';

const noop = (): void => {};

/** Text as React's static renderer escapes it (apostrophes become &#x27;). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function makeDoc(over: Partial<AssembledDoc> = {}): AssembledDoc {
  return {
    html: '<!doctype html><html lang="en"><head><title>Data Structures</title></head><body><main><h1>Data Structures</h1></main></body></html>',
    bytes: 2_516_582, // 2.4 MB
    report: {
      fixed: [
        { code: 'heading-normalized', severity: 'fixed', message: 'Heading levels were normalized.', count: 14 },
        { code: 'list-converted', severity: 'fixed', message: 'Fake lists were turned into real lists.', count: 3, sectionTitle: 'Week 1' },
      ],
      todo: [{ code: 'image-missing-alt', severity: 'todo', message: 'One image needs a description.', sectionTitle: 'Course Policies' }],
      info: [],
    },
    notices: [],
    ...over,
  };
}

function render(props: Partial<Parameters<typeof DownloadStep>[0]> = {}): string {
  return renderToStaticMarkup(
    <DownloadStep
      doc={makeDoc()}
      filename="ics123-syllabus.html"
      onDownload={noop}
      onDownloadReport={noop}
      onPrint={noop}
      onStartOver={noop}
      downloaded={false}
      notices={[]}
      onDismissNotice={noop}
      {...props}
    />,
  );
}

describe('DownloadStep', () => {
  it('renders the step heading, the action bar, the file size, and the document frame', () => {
    const html = render();
    expect(html).toContain('id="wizard-step-4-heading"');
    expect(html).toContain('Your syllabus is ready');
    expect(html).toContain('aria-labelledby="wizard-step-4-heading"');

    expect(html).toContain('role="group" aria-label="Your syllabus file"');
    for (const label of ['Print / PDF export', 'Accessibility report', 'Save HTML', 'Start over']) {
      expect(html).toContain(`<span class="tile-label">${label}</span>`);
    }
    // Download is the 56 px primary tile and comes first in the bar.
    expect(html).toMatch(/class="tile tile-primary tile-lg[^"]*"[^>]*>.*?<span class="tile-label">Print \/ PDF export<\/span>/);
    expect(html).toMatch(/class="tile tile-secondary tile-md"[^>]*>.*?<span class="tile-label">Save HTML<\/span>/);
    expect(html).toMatch(/class="tile tile-ghost tile-md[^"]*"[^>]*>.*?<span class="tile-label">Start over<\/span>/);
    expect(html).toContain('ics123-syllabus.html');
    expect(html).toContain('<span class="download-size tnum"><span class="visually-hidden">Size: </span>2.4 MB</span>');

    expect(html).toContain('title="Your syllabus"');
    expect(html).toContain('sandbox="allow-same-origin allow-modals"');
    expect(html).toMatch(/srcdoc="&lt;!doctype html&gt;/i);
    expect(html).toContain('class="sg-sheet-frame download-frame"');
    expect(html).toContain('class="sg-desk download-desk"');
  });

  it('renders the accessibility report as disclosures with counts', () => {
    const html = render();
    expect(html).toContain('<h3 id="download-report-heading"');
    expect(html).toContain('Accessibility report');
    expect(html).toContain('aria-controls="download-report-fixed"');
    expect(html).toContain('aria-controls="download-report-todo"');
    expect(html).not.toContain('aria-controls="download-report-info"');
    expect(html).toContain('<span class="disclosure-label">Fixed automatically</span><span class="visually-hidden">, </span><span class="disclosure-suffix">2</span>');
    expect(html).toContain('<span class="disclosure-label">Still needs you</span><span class="visually-hidden">, </span><span class="disclosure-suffix">1</span>');
    // "Still needs you" opens by default when it has entries; "Fixed" stays closed.
    expect(html).toMatch(/aria-expanded="true" aria-controls="download-report-todo"/);
    expect(html).toMatch(/aria-expanded="false" aria-controls="download-report-fixed"/);
    expect(html).toContain('One image needs a description.');
    expect(html).toContain('<span class="report-where"> — Course Policies</span>');
    expect(html).toContain('(14)');
  });

  it('shows Notes only when there are info entries, and empty states otherwise', () => {
    const doc = makeDoc({
      report: { fixed: [], todo: [], info: [{ code: 'mathml-kept', severity: 'info', message: 'MathML was kept as is.' }] },
    });
    const html = render({ doc });
    expect(html).toContain('aria-controls="download-report-info"');
    expect(html).toContain('<span class="disclosure-label">Notes</span><span class="visually-hidden">, </span><span class="disclosure-suffix">1</span>');
    expect(html).toContain('Nothing needed fixing.');
    expect(html).toContain('Nothing left for you to check.');
  });

  it('shows the download-first reminder before saving and the saved notice after', () => {
    const before = render({ downloaded: false });
    expect(before).toContain(esc(NOTICE_DOWNLOAD_FIRST));
    expect(before).not.toContain(STATUS.saved);

    const after = render({ downloaded: true });
    expect(after).not.toContain(esc(NOTICE_DOWNLOAD_FIRST));
    // Static, not a live region: the app's one live region announces "Saved" when the download happens.
    expect(after).toMatch(/<div id="download-saved" class="notice notice-success">/);
    expect(after).toContain(STATUS.saved);
  });

  it('renders contextual notices with the §14 copy, one per distinct sentence, each dismissible', () => {
    const notices: NoticeCode[] = ['equations', 'external-images', 'missing-files', 'interactive-removed'];
    const html = render({ notices });
    expect(html).toContain(esc(NOTICE_COPY.equations));
    expect(html).toContain(esc(NOTICE_COPY['interactive-removed']));
    const shared = esc(NOTICE_COPY['external-images']);
    expect(html.split(`<p>${shared}</p>`).length - 1).toBe(1);
    expect(html).toContain(`aria-label="Dismiss: ${esc(NOTICE_COPY.equations)}"`);
    // Interactive content is listed first per NOTICE_ORDER.
    expect(html.indexOf(esc(NOTICE_COPY['interactive-removed']))).toBeLessThan(html.indexOf(esc(NOTICE_COPY.equations)));
    // Notices that mount with the step carry no live role (they would not be announced reliably, and
    // several at once would talk over the focused heading); only errors are role="alert".
    expect(html.match(/class="notice notice-info"[^>]*>/g)?.length).toBe(3);
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('aria-live');
  });

  it('shows the print hint and the large-file notice when triggered', () => {
    const big = makeDoc({ bytes: 38 * 1024 * 1024 });
    const html = render({ doc: big, printHint: NOTICE_PRINT_BROWSER });
    expect(html).toContain(esc(NOTICE_PRINT_BROWSER));
    expect(html).toContain('This file is large (38 MB). Images were reduced to keep it manageable.');
    expect(html).toContain('38.0 MB');
    expect(render()).not.toContain('This file is large');
  });

  it('renders a Back tile only when onBack is given', () => {
    expect(render()).not.toContain('<span class="tile-label">Back</span>');
    expect(render({ onBack: noop })).toContain('<span class="tile-label">Back</span>');
  });

  it('puts no script in the page shell', () => {
    const html = render();
    expect(html).not.toMatch(/<script\b/i);
  });
});
