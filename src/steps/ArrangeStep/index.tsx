import type { Ref } from 'react';
import type { Cartridge, CoverInfo, DocOptions } from '../../lib/types';
import { WizardFrame } from '../../components/shell';
import { ProgressBar } from '../../components/ui';
import { SyllabusList, type SyllabusEntry } from './SyllabusList';
import { CoverForm } from './CoverForm';
import { LookGallery } from './LookGallery';
import { LayoutToggles } from './LayoutToggles';
import { LivePreview } from './LivePreview';
import './arrange.css';

export interface ArrangeStepProps {
  cart: Cartridge;
  /** Ordered resource ids of the selected pages. */
  order: string[];
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  cover: CoverInfo;
  onCover: (patch: Partial<CoverInfo>) => void;
  options: DocOptions;
  onOptions: (patch: Partial<DocOptions>) => void;
  includeLogo: boolean;
  onIncludeLogo: (on: boolean) => void;
  livePreviewSrcdoc?: string;
  /** True while a newer preview is pending or being assembled; the old one stays on screen meanwhile. */
  livePreviewLoading?: boolean;
  /** Back to "Choose pages". Omit to hide the Back tile. */
  onBack?: () => void;
  /** The primary action, "Generate syllabus". Omit to hide the Next tile. */
  onGenerate?: () => void;
  /** True while the document is being built: Generate goes inert and the progress bar shows. */
  generating?: boolean;
  /** Pages processed so far, shown as a progress bar beside Generate. */
  progress?: { done: number; total: number };
  /** Focus target when the step changes (WizardFrame heading). */
  headingRef?: Ref<HTMLHeadingElement>;
}

export const ARRANGE_STEP_TITLE = 'Arrange and style';
export const ARRANGE_STEP_INTRO = 'Put your pages in order, fill in the cover, and pick a look.';
export const GENERATE_LABEL = 'Generate syllabus';
export const GENERATE_HINT = 'Add at least one page first.';
export const GENERATING_HINT = 'Building your syllabus…';
export const PROGRESS_LABEL = 'Generating syllabus';

/**
 * Step 3 — Arrange and style (DESIGN.md §10).
 *
 * One grid, five areas, so the DOM order is the narrow-screen order and CSS
 * places them on wide screens (arrange.css):
 *
 *   DOM / narrow (< 992 px, one column):  Look · Preview · Layout · Your syllabus · Cover
 *   Wide (≥ 992 px, two columns):         left ≈ 42 %: Look, Layout, Your syllabus, Cover
 *                                         right ≈ 58 %: Preview, sticky in its own column
 *
 * The preview is always on screen — no disclosure — so a look change is seen
 * the moment it lands. Pure: state and callbacks come from the parent.
 */
export default function ArrangeStep({
  cart,
  order,
  onMove,
  onRemove,
  cover,
  onCover,
  options,
  onOptions,
  includeLogo,
  onIncludeLogo,
  livePreviewSrcdoc,
  livePreviewLoading = false,
  onBack,
  onGenerate,
  generating = false,
  progress,
  headingRef,
}: ArrangeStepProps) {
  const entries: SyllabusEntry[] = order.flatMap((id) => {
    const r = cart.resources.get(id);
    return r ? [{ id, title: r.title, kind: r.kind }] : [];
  });
  const n = entries.length;
  const pages = (k: number): string => `${k} ${k === 1 ? 'page' : 'pages'}`;

  return (
    <WizardFrame
      step={3}
      title={ARRANGE_STEP_TITLE}
      intro={ARRANGE_STEP_INTRO}
      headingRef={headingRef}
      className="arrange-step"
      back={onBack ? { label: 'Back', onClick: onBack } : undefined}
      next={
        onGenerate
          ? {
              label: GENERATE_LABEL,
              onClick: onGenerate,
              disabled: n === 0 || generating,
              hint: generating ? GENERATING_HINT : GENERATE_HINT,
              icon: 'bi-file-earmark-check',
            }
          : undefined
      }
      aside={
        generating ? (
          <ProgressBar
            id="arrange-progress"
            label={PROGRESS_LABEL}
            value={progress?.done ?? 0}
            max={progress?.total ?? n}
            valueText={`${progress?.done ?? 0} of ${pages(progress?.total ?? n)}`}
          />
        ) : (
          <span className="wizard-nav-count tnum">{pages(n)}</span>
        )
      }
    >
      <div className="wizard-columns arrange-columns">
        <div className="wizard-col arrange-area arrange-area-look">
          <LookGallery presentation={options.presentation} palette={options.palette} onOptions={onOptions} />
        </div>
        <div className="wizard-col arrange-area arrange-area-preview">
          <LivePreview srcdoc={livePreviewSrcdoc} loading={livePreviewLoading} hasPages={n > 0} />
        </div>
        <div className="wizard-col arrange-area arrange-area-toggles">
          <LayoutToggles options={options} onOptions={onOptions} includeLogo={includeLogo} onIncludeLogo={onIncludeLogo} />
        </div>
        <div className="wizard-col arrange-area arrange-area-list">
          <SyllabusList entries={entries} onMove={onMove} onRemove={onRemove} />
        </div>
        <div className="wizard-col arrange-area arrange-area-cover">
          <CoverForm
            cover={cover}
            onCover={onCover}
            language={options.language}
            onLanguage={(language) => onOptions({ language })}
          />
        </div>
      </div>
    </WizardFrame>
  );
}
