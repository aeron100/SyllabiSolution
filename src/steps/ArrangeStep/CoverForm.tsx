import type { CoverInfo } from '../../lib/types';
import { HINTS } from '../../ui/copy';
import { languageOptions } from './languages';

export interface CoverFormProps {
  cover: CoverInfo;
  onCover: (patch: Partial<CoverInfo>) => void;
  /** BCP-47 tag from DocOptions.language. */
  language: string;
  onLanguage: (language: string) => void;
}

type TextField = 'instructor' | 'email' | 'officeHours' | 'meetingTimes';

interface FieldSpec {
  key: TextField;
  id: string;
  label: string;
  type: 'text' | 'email';
  autoComplete?: string;
  /** One-sentence hint shown under the field and linked with aria-describedby. */
  hint?: string;
}

const FIELDS: readonly FieldSpec[] = [
  { key: 'instructor', id: 'arrange-instructor', label: 'Instructor name', type: 'text', autoComplete: 'name', hint: 'Shown under the course title on the cover.' },
  { key: 'email', id: 'arrange-email', label: 'Email', type: 'email', autoComplete: 'email' },
  { key: 'officeHours', id: 'arrange-office-hours', label: 'Office hours', type: 'text' },
  { key: 'meetingTimes', id: 'arrange-meeting-times', label: 'Meeting times', type: 'text' },
];

export const LANGUAGE_HINT = 'Tells screen readers which language the document is in.';

/**
 * Cover form: all fields optional, all labelled, 44 px inputs (DESIGN.md §10, §15).
 * The legend holds an h3 so "Cover" is a heading-navigation stop as well as
 * the fieldset's name. The logo switch lives with the layout toggles
 * (LayoutToggles), next to the cover-page toggle it depends on.
 */
export function CoverForm({ cover, onCover, language, onLanguage }: CoverFormProps) {
  const setField = (key: TextField, value: string): void => {
    const patch: Partial<CoverInfo> = {};
    patch[key] = value;
    onCover(patch);
  };

  return (
    <fieldset className="arrange-cover" aria-describedby="arrange-cover-hint">
      <legend className="wizard-col-title">
        <h3>Cover</h3>
      </legend>
      <p className="sg-hint" id="arrange-cover-hint">
        {HINTS.cover}
      </p>
      <p className="arrange-course">
        <span className="visually-hidden">Course: </span>
        <strong>{cover.courseTitle}</strong>
        {cover.courseCode && <span className="sg-muted"> · {cover.courseCode}</span>}
        {cover.term && <span className="sg-muted"> · {cover.term}</span>}
      </p>
      <div className="arrange-fields">
        {FIELDS.map((f) => (
          <div key={f.key} className="arrange-field">
            <label className="form-label" htmlFor={f.id}>
              {f.label}
            </label>
            <input
              id={f.id}
              className="form-control"
              type={f.type}
              autoComplete={f.autoComplete}
              aria-describedby={f.hint ? `${f.id}-hint` : undefined}
              value={cover[f.key] ?? ''}
              onChange={(e) => setField(f.key, e.target.value)}
            />
            {f.hint && (
              <p className="form-text sg-hint" id={`${f.id}-hint`}>
                {f.hint}
              </p>
            )}
          </div>
        ))}
        <div className="arrange-field">
          <label className="form-label" htmlFor="arrange-language">
            Language
          </label>
          <select
            id="arrange-language"
            className="form-select"
            value={language}
            aria-describedby="arrange-language-hint"
            onChange={(e) => onLanguage(e.target.value)}
          >
            {languageOptions(language).map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
          <p id="arrange-language-hint" className="form-text">
            {LANGUAGE_HINT}
          </p>
        </div>
      </div>
    </fieldset>
  );
}
