/**
 * DESIGN.md §8: every palette is a data row covered by the contrast test.
 * A palette that fails is a failing test, so a bad hex cannot ship.
 * The WCAG helper here is independent of src (test/generate/helpers.ts).
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_PALETTE, INK, PALETTES, getPalette } from '../../src/lib/generate/colors';
import { contrastRatio, mixHex, relativeLuminance } from '../../src/lib/generate/contrast';
import { MUTED_INK, gridColor } from '../../src/lib/generate/themes';
import { contrast, luminance } from './helpers';

const HEX = /^#[0-9a-f]{6}$/;

describe('contrast helper sanity', () => {
  it('matches known ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrast('#1e3a8a', '#ffffff')).toBeGreaterThan(10);
  });

  it('agrees with the module the theme uses', () => {
    for (const [a, b] of [
      ['#000000', '#ffffff'],
      ['#777777', '#ffffff'],
      ['#d97706', '#f0f9ff'],
      ['#1c1917', '#fff7ed'],
    ] as const) {
      expect(contrastRatio(a, b)).toBeCloseTo(contrast(a, b), 6);
      expect(relativeLuminance(a)).toBeCloseTo(luminance(a), 6);
    }
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('the palette set', () => {
  it('has the thirteen palettes of §8 (three institution, ten general) with unique ids and the documented default', () => {
    expect(PALETTES.length).toBe(13);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(13);
    expect(DEFAULT_PALETTE).toBe('coastline');
    expect(PALETTES.some((p) => p.id === DEFAULT_PALETTE)).toBe(true);
    expect(getPalette(DEFAULT_PALETTE).name).toBe('Coastline');
    expect(PALETTES.filter((p) => p.group === 'institution').map((p) => p.id)).toEqual(['coastline', 'golden-west', 'orange-coast']);
  });

  it('resolves unknown ids to the default', () => {
    expect(getPalette('no-such-palette').id).toBe(DEFAULT_PALETTE);
    expect(getPalette(undefined).id).toBe(DEFAULT_PALETTE);
    expect(getPalette('plum-blush').id).toBe('plum-blush');
  });

  it('uses lower-case #rrggbb everywhere, ink included', () => {
    expect(INK).toMatch(HEX);
    expect(MUTED_INK).toMatch(HEX);
    for (const p of PALETTES) {
      for (const role of ['primary', 'secondary', 'accent', 'tint', 'paper'] as const) {
        expect(p[role], `${p.id} ${role}`).toMatch(HEX);
      }
    }
  });
});

describe.each(PALETTES)('$name ($id)', (p) => {
  it('primary and accent are readable text on paper (≥ 4.5:1)', () => {
    expect(contrast(p.primary, p.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accent, p.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('paper is readable text on a primary surface (≥ 4.5:1)', () => {
    expect(contrast(p.paper, p.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('ink is readable on the tint and on paper (≥ 4.5:1)', () => {
    expect(contrast(INK, p.tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(INK, p.paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('secondary is visible as a rule against paper (≥ 3:1)', () => {
    expect(contrast(p.secondary, p.paper)).toBeGreaterThanOrEqual(3);
  });

  it('where the theme actually puts them: links on the tint, captions in muted ink, gridlines', () => {
    // TOC links sit on the tint panel.
    expect(contrast(p.accent, p.tint)).toBeGreaterThanOrEqual(4.5);
    // Captions and metadata are muted ink, never secondary.
    expect(contrast(MUTED_INK, p.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(MUTED_INK, p.tint)).toBeGreaterThanOrEqual(4.5);
    // The softened gridline stays a measurable boundary on paper and on zebra rows.
    const grid = gridColor(p);
    expect(grid).toMatch(HEX);
    expect(contrast(grid, p.paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(grid, p.tint)).toBeGreaterThanOrEqual(3);
  });

  it('is sourced from exactly the Tailwind tokens the §8 table names', () => {
    if (p.group === 'institution') {
      // Institution palettes cite a published brand guide instead of Tailwind tokens.
      expect(p.source.primary).toMatch(/brand(ing)? guide/i);
      return;
    }
    expect(p.source).toEqual(DESIGN_TABLE[p.id]);
    // and the general role-to-step rule holds (secondary may step to 700/800 where the table says so)
    const step = (token: string) => token.split('-').pop() ?? token;
    expect(['800', '900']).toContain(step(p.source.primary));
    expect(['500', '600', '700', '800']).toContain(step(p.source.secondary));
    expect(['600', '700', '800']).toContain(step(p.source.accent));
    expect(['50', '100']).toContain(step(p.source.tint));
    expect(['white', 'stone-50', 'neutral-50']).toContain(p.source.paper);
  });
});

/** DESIGN.md §8 "The set", token by token. colors.ts is generated from these. */
const DESIGN_TABLE: Record<string, Record<'primary' | 'secondary' | 'accent' | 'tint' | 'paper', string>> = {
  'ink-paper': { primary: 'neutral-900', secondary: 'neutral-500', accent: 'neutral-700', tint: 'neutral-100', paper: 'white' },
  'ember-ash': { primary: 'orange-800', secondary: 'stone-500', accent: 'amber-700', tint: 'orange-50', paper: 'stone-50' },
  'jade-gold': { primary: 'emerald-800', secondary: 'emerald-600', accent: 'yellow-700', tint: 'emerald-50', paper: 'white' },
  'sapphire-brass': { primary: 'blue-900', secondary: 'amber-600', accent: 'sky-800', tint: 'sky-50', paper: 'white' },
  'plum-blush': { primary: 'purple-900', secondary: 'rose-500', accent: 'fuchsia-800', tint: 'rose-50', paper: 'stone-50' },
  'slate-coral': { primary: 'slate-800', secondary: 'teal-600', accent: 'rose-700', tint: 'slate-100', paper: 'white' },
  'garnet-cream': { primary: 'red-900', secondary: 'stone-500', accent: 'yellow-700', tint: 'amber-50', paper: 'stone-50' },
  'ochre-olive': { primary: 'yellow-800', secondary: 'lime-700', accent: 'orange-800', tint: 'yellow-50', paper: 'stone-50' },
  'harbor-sand': { primary: 'cyan-900', secondary: 'teal-600', accent: 'amber-800', tint: 'cyan-50', paper: 'white' },
  'terracotta-moss': { primary: 'orange-900', secondary: 'lime-800', accent: 'stone-600', tint: 'orange-50', paper: 'stone-50' },
};
