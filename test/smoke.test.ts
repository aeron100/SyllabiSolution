import { describe, it, expect } from 'vitest';
describe('env', () => {
  it('has DOMParser (jsdom)', () => {
    const d = new DOMParser().parseFromString('<a xmlns="x"><b/></a>', 'application/xml');
    expect(d.documentElement.localName).toBe('a');
  });
});
