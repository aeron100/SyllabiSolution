import type { DocOptions } from '../../lib/types';
import { Switch } from '../../components/ui';
import { LOGO_DATA_URI } from '../../ui/assets';

export interface LayoutTogglesProps {
  options: Pick<DocOptions, 'showCover' | 'showToc' | 'pageBreaks'>;
  onOptions: (patch: Partial<DocOptions>) => void;
  /** Put the Coastline College mark on the cover. Kept outside DocOptions (see useSyllabus). */
  includeLogo: boolean;
  onIncludeLogo: (on: boolean) => void;
}

export const LOGO_LABEL = 'Coastline College logo';
export const LOGO_HINT = 'On the cover, above the course title.';
export const LOGO_NO_COVER_HINT = 'Turn on the cover page to show it.';

/**
 * The four layout toggles; they apply to both looks (DESIGN.md §8). The logo
 * switch sits right under "Cover page", the toggle it depends on, with the
 * mark shown small beside it so the choice is visible without opening the
 * preview. The legend holds an h3 (HTML allows heading content in a legend),
 * so the section names the fieldset AND is reachable by heading navigation
 * like the other column titles.
 */
export function LayoutToggles({ options, onOptions, includeLogo, onIncludeLogo }: LayoutTogglesProps) {
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
        id="arrange-logo"
        label={LOGO_LABEL}
        hint={options.showCover ? LOGO_HINT : LOGO_NO_COVER_HINT}
        checked={includeLogo}
        onChange={onIncludeLogo}
        aside={
          // Decorative: the label already names the logo. Dimmed, not hidden, when off.
          <span className={`sg-logo-plate arrange-logo-thumb${includeLogo ? '' : ' is-off'}`}>
            <img src={LOGO_DATA_URI} alt="" className="arrange-logo-thumb-img" width={76} height={20} decoding="async" />
          </span>
        }
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
