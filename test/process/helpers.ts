import type { AssetRef, ExtractedContent, ProcessOptions, ProcessedPage, ReportEntry } from '../../src/lib/types';
import { processContent } from '../../src/lib/process';

/** 1x1 transparent PNG. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** A PNG data URI whose header claims the given size (only the header is real). */
export function fakePng(width: number, height: number): string {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  b.set([(width >>> 24) & 255, (width >>> 16) & 255, (width >>> 8) & 255, width & 255], 16);
  b.set([(height >>> 24) & 255, (height >>> 16) & 255, (height >>> 8) & 255, height & 255], 20);
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return 'data:image/png;base64,' + btoa(bin);
}

/** 400x300 PNG header (a normal content image); the default for anything not special-cased. */
export const NORMAL_PNG = fakePng(400, 300);

export const defaultResolveAsset = async (href: string): Promise<AssetRef | null> => {
  if (/missing/i.test(href)) return null;
  if (/\.pdf(\?|$)/i.test(href)) return { dataUri: 'data:application/pdf;base64,AA==', bytes: 1, mime: 'application/pdf' };
  if (/wide/i.test(href)) return { dataUri: fakePng(1200, 400), bytes: 33, mime: 'image/png' };
  if (/tiny|dot/i.test(href)) return { dataUri: TINY_PNG, bytes: 68, mime: 'image/png' };
  return { dataUri: NORMAL_PNG, bytes: 33, mime: 'image/png' };
};

export function makeOpts(over: Partial<ProcessOptions> = {}): ProcessOptions {
  return {
    sectionId: 'sec-1',
    sectionTitle: 'Test Section',
    selectedSections: new Map<string, string>(),
    resolveAsset: defaultResolveAsset,
    ...over,
  };
}

export async function run(
  html: string,
  over: Partial<ProcessOptions> = {},
  content: Partial<ExtractedContent> = {},
): Promise<ProcessedPage> {
  const c: ExtractedContent = {
    resourceId: 'r1',
    kind: 'page',
    title: 'Test Section',
    html,
    meta: {},
    ...content,
  };
  return processContent(c, makeOpts(over));
}

export function entry(p: ProcessedPage, code: string): ReportEntry | undefined {
  return p.report.find((e) => e.code === code);
}

export function codes(p: ProcessedPage, severity?: ReportEntry['severity']): string[] {
  return p.report.filter((e) => !severity || e.severity === severity).map((e) => e.code);
}
