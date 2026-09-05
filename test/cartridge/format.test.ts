import { describe, expect, it } from 'vitest';
import {
  dueLabel,
  escapeHtml,
  formatDate,
  formatPoints,
  ianaZone,
  metaLine,
  pointsLabel,
  questionsLabel,
  toBase64,
} from '../../src/lib/cartridge/format';
import { slugify, stripFileBase, stripWikiRef } from '../../src/lib/cartridge/paths';

describe('formatDate', () => {
  it('treats zone-less Canvas timestamps as UTC', () => {
    expect(formatDate('2026-10-26T06:59:00')).toBe('Oct 26, 2026');
    expect(formatDate('2026-10-26T06:59:00Z')).toBe('Oct 26, 2026');
    expect(formatDate('2026-11-15')).toBe('Nov 15, 2026');
  });
  it('prefers all_day_date and renders in the course zone when known', () => {
    expect(formatDate('2026-10-26T06:59:00', { allDayDate: '2026-10-25' })).toBe('Oct 25, 2026');
    expect(formatDate('2026-10-26T06:59:00', { timeZone: 'America/Los_Angeles' })).toBe('Oct 25, 2026');
    expect(formatDate('2026-10-26T06:59:00', { timeZone: 'Not/AZone' })).toBe('Oct 26, 2026');
  });
  it('returns undefined for missing or invalid input', () => {
    expect(formatDate(undefined)).toBeUndefined();
    expect(formatDate('')).toBeUndefined();
    expect(formatDate('soon')).toBeUndefined();
  });
  it('maps Rails zone names', () => {
    expect(ianaZone('Pacific Time (US & Canada)')).toBe('America/Los_Angeles');
    expect(ianaZone('Europe/Paris')).toBe('Europe/Paris');
    expect(ianaZone('Mars')).toBeUndefined();
  });
});

describe('labels', () => {
  it('formats points and questions', () => {
    expect(formatPoints(25)).toBe('25');
    expect(formatPoints(12.5)).toBe('12.5');
    expect(formatPoints(1 / 3)).toBe('0.33');
    expect(pointsLabel(1)).toBe('1 point');
    expect(pointsLabel(25)).toBe('25 points');
    expect(pointsLabel(undefined)).toBeUndefined();
    expect(questionsLabel(1)).toBe('1 question');
    expect(questionsLabel(12)).toBe('12 questions');
    expect(questionsLabel(0)).toBeUndefined();
    expect(dueLabel('2026-11-15T07:59:00')).toBe('Due Nov 15, 2026');
  });
  it('builds a meta line only from present parts', () => {
    expect(metaLine([undefined, '25 points', undefined, 'Due Nov 15, 2026'])).toBe(
      '<p class="sg-meta">25 points · Due Nov 15, 2026</p>',
    );
    expect(metaLine([undefined])).toBe('');
  });
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});

describe('base64', () => {
  it('matches the standard encoding including padding', () => {
    const enc = (s: string) => toBase64(new TextEncoder().encode(s));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg==');
    expect(enc('fo')).toBe('Zm8=');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foobar')).toBe('Zm9vYmFy');
    const big = new Uint8Array(200_003).map((_, i) => (i * 7) & 255);
    expect(toBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });
});

describe('placeholders', () => {
  it('recognises every $IMS-CC-FILEBASE$ spelling', () => {
    expect(stripFileBase('$IMS-CC-FILEBASE$/a/b.png')).toBe('a/b.png');
    expect(stripFileBase('$IMS_CC_FILEBASE$/a/b.png')).toBe('a/b.png');
    expect(stripFileBase('%24IMS-CC-FILEBASE%24/a/b.png')).toBe('a/b.png');
    expect(stripFileBase('%24IMS_CC_FILEBASE%24/a.png')).toBe('a.png');
    expect(stripFileBase('a/b.png')).toBeNull();
    expect(stripWikiRef('$WIKI_REFERENCE$/pages/slug-here?x=1')).toBe('slug-here?x=1');
    expect(stripWikiRef('%24WIKI_REFERENCE%24/pages/slug')).toBe('slug');
    expect(stripWikiRef('/pages/slug')).toBeNull();
  });
  it('slugifies like Canvas', () => {
    expect(slugify(' Course Materials, Software, & Technology Requirements')).toBe(
      'course-materials-software-and-technology-requirements',
    );
  });
});
