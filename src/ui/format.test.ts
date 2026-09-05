import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatBytes,
  isCartridgeFilename,
  isChromiumBrowser,
  megabytes,
  primaryLanguage,
  reportFilename,
  slugify,
  syllabusFilename,
} from './format';

describe('formatBytes', () => {
  it('formats B, KB, MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(200 * 1024)).toBe('200 KB');
    expect(formatBytes(38 * 1024 * 1024 + 300000)).toBe('38.3 MB');
    expect(formatBytes(-1)).toBe('0 B');
  });
  it('rounds whole megabytes for the large-file notice', () => {
    expect(megabytes(38 * 1024 * 1024)).toBe(38);
    expect(megabytes(10)).toBe(1);
  });
});

describe('filenames', () => {
  it('slugifies with accents and punctuation removed', () => {
    expect(slugify('ICS 123 — Fundamentals: Data Structures!')).toBe('ics-123-fundamentals-data-structures');
    expect(slugify('Éducation française')).toBe('education-francaise');
    expect(slugify('***')).toBe('course');
  });
  it('prefers the course code, falls back to the title', () => {
    expect(syllabusFilename('ICS123-24142', 'Whatever')).toBe('ics123-24142-syllabus.html');
    expect(syllabusFilename('   ', 'Intro to Things')).toBe('intro-to-things-syllabus.html');
    expect(syllabusFilename(undefined, 'Intro to Things')).toBe('intro-to-things-syllabus.html');
    expect(reportFilename('ICS123', 'x')).toBe('ics123-accessibility-report.txt');
  });
  it('accepts .imscc and .zip only', () => {
    expect(isCartridgeFilename('course.imscc')).toBe(true);
    expect(isCartridgeFilename('COURSE.ZIP')).toBe(true);
    expect(isCartridgeFilename('notes.pdf')).toBe(false);
  });
});

describe('primaryLanguage', () => {
  it('reduces BCP-47 tags to the primary subtag', () => {
    expect(primaryLanguage('en-US')).toBe('en');
    expect(primaryLanguage('pt_BR')).toBe('pt');
    expect(primaryLanguage('')).toBe('en');
    expect(primaryLanguage(undefined)).toBe('en');
    expect(primaryLanguage('x-weird')).toBe('en');
  });
});

describe('isChromiumBrowser', () => {
  const chrome =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  const edge = `${chrome} Edg/128.0.0.0`;
  const safari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:129.0) Gecko/20100101 Firefox/129.0';
  it('uses UA when no client hints', () => {
    expect(isChromiumBrowser(chrome)).toBe(true);
    expect(isChromiumBrowser(edge)).toBe(true);
    expect(isChromiumBrowser(safari)).toBe(false);
    expect(isChromiumBrowser(firefox)).toBe(false);
  });
  it('prefers client-hint brands', () => {
    expect(isChromiumBrowser(safari, [{ brand: 'Chromium' }, { brand: 'Not.A/Brand' }])).toBe(true);
    expect(isChromiumBrowser(chrome, [{ brand: 'Brave' }])).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});
