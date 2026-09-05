/**
 * Processing module public API. Implemented across unwrap.ts / sanitize.ts /
 * links.ts / structure.ts / headings.ts / styles.ts / report.ts / assets.ts.
 * See DESIGN.md §6b–§6e and §9.
 *
 * The pipeline is deterministic: no clocks, no randomness, document order
 * everywhere. Same input → byte-identical output.
 */
import type { ExtractedContent, ProcessOptions, ProcessedPage } from '../types';
import { unwrapDocument } from './unwrap';
import { assertSafe, sanitizeHtml, type SanitizeContext } from './sanitize';
import { rewriteLinks } from './links';
import { fixStructure } from './structure';
import { buildVariants } from './styles';
import { Reporter } from './report';
import { downscaleImage as downscale } from './assets';

/** Run the full pipeline (unwrap → safety → links → structure → variants). */
export async function processContent(content: ExtractedContent, opts: ProcessOptions): Promise<ProcessedPage> {
  const rep = new Reporter(opts.sectionId, opts.sectionTitle);
  // Kinds with no renderable body (question banks, settings bundles…) show
  // their title only; say so rather than leave an unexplained empty section.
  if (content.kind === 'other') rep.add('title-only', 1, content.title);
  const html = unwrapDocument(content.html ?? '');
  const ctx: SanitizeContext = { lmsHosts: new Set() };
  const root = sanitizeHtml(html, rep, ctx);
  const assetBytes = await rewriteLinks(root, opts, rep, ctx.lmsHosts);
  fixStructure(root, opts, rep);
  const { original, neutral } = buildVariants(root, opts.sectionId, rep);
  assertSafe(original);
  assertSafe(neutral);
  return {
    resourceId: content.resourceId,
    sectionId: opts.sectionId,
    title: content.title,
    kind: content.kind,
    original,
    neutral,
    report: rep.entries(),
    notices: rep.notices(),
    assetBytes,
  };
}

/**
 * Browser-only image downscaler using <canvas>. Returns the input unchanged
 * when the image is already within maxWidth or cannot be decoded.
 */
export async function downscaleImage(
  bytes: Uint8Array,
  mime: string,
  maxWidth = 1600,
): Promise<{ bytes: Uint8Array; mime: string }> {
  return downscale(bytes, mime, maxWidth);
}

export { assertSafe } from './sanitize';
export { imageDimensions } from './assets';
