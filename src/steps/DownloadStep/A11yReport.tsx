import type { AssembledDoc, ReportEntry } from '../../lib/types';
import { Disclosure } from '../../components/ui';

export interface A11yReportProps {
  report: AssembledDoc['report'];
}

function EntryList({ entries, emptyText }: { entries: ReportEntry[]; emptyText: string }) {
  if (entries.length === 0) return <p className="report-empty">{emptyText}</p>;
  return (
    <ul className="report-list">
      {entries.map((e, i) => (
        <li key={`${e.code}-${e.sectionId ?? ''}-${i}`}>
          <span className="report-message">
            {e.message}
            {e.count !== undefined && e.count > 1 && <span className="tnum"> ({e.count})</span>}
          </span>
          {e.sectionTitle && <span className="report-where"> — {e.sectionTitle}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * The accessibility report as disclosures with counts (DESIGN.md §9c):
 * "Fixed automatically", "Still needs you", and "Notes" when there are any.
 * Each entry is one sentence; the section it belongs to follows in muted text.
 * "Still needs you" opens by default when it has entries.
 */
export function A11yReport({ report }: A11yReportProps) {
  return (
    <section className="download-report" aria-labelledby="download-report-heading">
      <h3 id="download-report-heading" className="download-report-title">
        Accessibility report
      </h3>
      <p className="sg-hint download-report-hint">What was fixed for you, and what still needs a look. It is not part of the syllabus file.</p>
      <Disclosure id="download-report-fixed" label="Fixed automatically" suffix={report.fixed.length}>
        <EntryList entries={report.fixed} emptyText="Nothing needed fixing." />
      </Disclosure>
      <Disclosure id="download-report-todo" label="Still needs you" suffix={report.todo.length} defaultOpen={report.todo.length > 0}>
        <EntryList entries={report.todo} emptyText="Nothing left for you to check." />
      </Disclosure>
      {report.info.length > 0 && (
        <Disclosure id="download-report-info" label="Notes" suffix={report.info.length}>
          <EntryList entries={report.info} emptyText="No notes." />
        </Disclosure>
      )}
    </section>
  );
}
