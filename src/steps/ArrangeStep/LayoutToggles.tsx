import type { DocOptions } from '../../lib/types';
import { Switch } from '../../components/ui';

export interface LayoutTogglesProps {
  options: Pick<DocOptions, 'showCover' | 'showToc' | 'pageBreaks'>;
  onOptions: (patch: Partial<DocOptions>) => void;
}

/**
 * The three layout toggles; they apply to both looks (DESIGN.md §8).
 * The legend holds an h3 (HTML allows heading content in a legend), so the
 * section names the fieldset AND is reachable by heading navigation like the
 * other column titles.
 */
export function LayoutToggles({ options, onOptions }: LayoutTogglesProps) {
  return (
    <fieldset className="arrange-toggles">
      <legend className="wizard-col-title">
        <h3>Layout</h3>
      </legend>
      <Switch
        id="arrange-cover-page"
        label="Cover page"
        hint="Course title, term, and the details from the cover form."
        checked={options.showCover}
        onChange={(v) => onOptions({ showCover: v })}
      />
      <Switch
        id="arrange-toc"
        label="Table of contents"
        hint="A list of the sections, after the cover."
        checked={options.showToc}
        onChange={(v) => onOptions({ showToc: v })}
      />
      <Switch
        id="arrange-page-breaks"
        label="Page break between sections"
        hint="Each section starts on a new page when printed."
        checked={options.pageBreaks}
        onChange={(v) => onOptions({ pageBreaks: v })}
      />
    </fieldset>
  );
}
