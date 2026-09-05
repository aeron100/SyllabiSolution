import { describe, it, expect } from 'vitest';
import { clean, escapeHtml, isLanguageTag, looksLikeEmail, utf8Length } from '../../src/lib/generate/text';

describe('escapeHtml', () => {
  it('escapes the five significant characters and nothing else', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml('plain – text ✓')).toBe('plain – text ✓');
    expect(escapeHtml('')).toBe('');
  });
});

describe('utf8Length', () => {
  it('matches TextEncoder for ASCII, Latin, CJK, emoji and lone surrogates', () => {
    const samples = [
      '',
      'hello',
      'café – naïve',
      '日本語のテキスト',
      'emoji 😀🎓 pair',
      '\u{1F600}',
      'lone high \ud83d end',
      'lone low \ude00 end',
      '\ud83d😀',
      'a'.repeat(1000) + 'é'.repeat(1000) + '中'.repeat(1000) + '😀'.repeat(1000),
    ];
    const enc = new TextEncoder();
    for (const s of samples) expect(utf8Length(s), JSON.stringify(s)).toBe(enc.encode(s).length);
  });
});

describe('isLanguageTag', () => {
  it('accepts common BCP-47 shapes and rejects junk', () => {
    for (const ok of ['en', 'en-US', 'pt-BR', 'zh-Hant-TW', 'es-419', 'fil']) expect(isLanguageTag(ok), ok).toBe(true);
    for (const bad of ['', 'e', 'en_US', 'en-', '"><x', 'english language', '1234']) expect(isLanguageTag(bad), bad).toBe(false);
  });
});

describe('looksLikeEmail', () => {
  it('accepts plausible addresses and rejects text with spaces, quotes or angle brackets', () => {
    for (const ok of ['a@b.co', 'first.last+tag@uni.edu', 'x_y@sub.domain.org']) expect(looksLikeEmail(ok), ok).toBe(true);
    for (const bad of ['', 'no-at.edu', 'a@b', 'a b@c.edu', '"a"@b.edu', '<a@b.edu>', 'a@b.edu (office)']) {
      expect(looksLikeEmail(bad), bad).toBe(false);
    }
  });
});

describe('clean', () => {
  it('trims and collapses whitespace; tolerates undefined', () => {
    expect(clean('  a \n\t b  ')).toBe('a b');
    expect(clean(undefined)).toBe('');
    expect(clean(null)).toBe('');
  });
});
