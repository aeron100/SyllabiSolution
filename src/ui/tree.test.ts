import { describe, expect, it } from 'vitest';
import type { Cartridge, Item, Kind, Resource, ZipIndex } from '../lib/types';
import {
  courseGroup,
  addMany,
  appendSelection,
  countModules,
  descendantResourceIds,
  insertInOrder,
  kindCounts,
  kindsPresent,
  moveItem,
  orderIndex,
  removeMany,
  selectionKey,
  sortByIndex,
  treeOrder,
  unfiledGroup,
  unfiledIds,
  visibleIds,
} from './tree';

const zip: ZipIndex = {
  names: () => [],
  has: () => false,
  resolve: () => null,
  size: () => undefined,
  bytes: () => Promise.reject(new Error('no')),
  text: () => Promise.reject(new Error('no')),
};

function res(id: string, kind: Kind, title = id): Resource {
  return { id, type: 'x', files: [], dependencies: [], kind, title, meta: {} };
}

function item(id: string, title: string, resourceId?: string, children: Item[] = []): Item {
  return resourceId ? { id, title, resourceId, children } : { id, title, children };
}

function cart(): Cartridge {
  const resources = new Map<string, Resource>([
    ['syl', res('syl', 'syllabus', 'Course Syllabus')],
    ['p1', res('p1', 'page', 'Welcome')],
    ['p2', res('p2', 'page', 'Week 1')],
    ['a1', res('a1', 'assignment', 'Homework 1')],
    ['q1', res('q1', 'quiz', 'Quiz 1')],
    ['f1', res('f1', 'file', 'zeta.png')],
    ['f2', res('f2', 'file', 'alpha.pdf')],
  ]);
  return {
    title: 'T',
    version: '1.1.0',
    source: 'canvas',
    items: [
      item('m1', 'Module 1', undefined, [
        item('i1', 'Welcome', 'p1'),
        item('h1', 'Readings'),
        item('i2', 'Homework 1', 'a1'),
        item('i3', 'Week 1', 'p2'),
      ]),
      item('m2', 'Module 2', undefined, [
        item('i4', 'Week 1 (again)', 'p2'), // duplicate placement
        item('i5', 'Quiz 1', 'q1'),
      ]),
      item('top', 'Syllabus', 'syl'),
    ],
    resources,
    unfiled: ['f1', 'f2'],
    assignmentGroups: [],
    zip,
  };
}

describe('treeOrder', () => {
  // The syllabus kind always leads the default order (DESIGN.md §10).
  it('walks depth-first, dedupes repeats, then appends Unfiled sorted by title', () => {
    expect(treeOrder(cart())).toEqual(['syl', 'p1', 'a1', 'p2', 'q1', 'f2', 'f1']);
  });
  it('sorts unfiled by title and builds a synthetic group', () => {
    const c = cart();
    expect(unfiledIds(c)).toEqual(['f2', 'f1']);
    const g = unfiledGroup(c);
    expect(g.title).toBe('Unfiled');
    expect(g.children.map((x) => x.resourceId)).toEqual(['f2', 'f1']);
  });
  it('counts modules as top-level items with children', () => {
    expect(countModules(cart())).toBe(2);
  });
});

describe('counts and filters', () => {
  it('counts unique resources per kind', () => {
    const c = cart();
    const counts = kindCounts(c, treeOrder(c));
    expect(counts.get('page')).toBe(2);
    expect(counts.get('file')).toBe(2);
    expect(counts.get('link')).toBeUndefined();
    expect(kindsPresent(counts)).toEqual(['syllabus', 'page', 'assignment', 'quiz', 'file']);
  });
  it('hides kinds from the visible list and from group descendants', () => {
    const c = cart();
    const hidden = new Set<Kind>(['file', 'page']);
    expect(visibleIds(c, treeOrder(c), hidden)).toEqual(['syl', 'a1', 'q1']);
    expect(descendantResourceIds(c.items[0], c, hidden)).toEqual(['a1']);
    expect(descendantResourceIds(c.items[0], c, new Set())).toEqual(['p1', 'a1', 'p2']);
  });
});

describe('selection edits', () => {
  // The order of selection is the document order (DESIGN.md §10).
  const index = orderIndex(['a', 'b', 'c', 'd']);
  it('appends a newly checked id at the end, whatever its tree position', () => {
    expect(insertInOrder(['a', 'd'], 'c')).toEqual(['a', 'd', 'c']);
    expect(insertInOrder(['d'], 'a')).toEqual(['d', 'a']);
    expect(insertInOrder([], 'b')).toEqual(['b']);
    expect(insertInOrder(['a'], 'a')).toEqual(['a']);
    expect(insertInOrder(['a'], 'zzz')).toEqual(['a', 'zzz']);
    expect(appendSelection).toBe(insertInOrder);
  });
  it('uncheck then re-check moves the id to the end and renumbers the rest', () => {
    let sel = ['a', 'b', 'c'];
    sel = removeMany(sel, ['a']);
    expect(sel).toEqual(['b', 'c']);
    sel = insertInOrder(sel, 'a');
    expect(sel).toEqual(['b', 'c', 'a']);
  });
  it('adds many by appending the missing ids in tree order after the existing order, untouched', () => {
    expect(addMany(['d', 'a'], ['c', 'b'], index)).toEqual(['d', 'a', 'b', 'c']);
    expect(addMany(['d', 'a'], ['a', 'c', 'b', 'd'], index)).toEqual(['d', 'a', 'b', 'c']);
    expect(addMany(['a'], ['a'], index)).toEqual(['a']);
    expect(addMany([], ['c', 'a', 'b', 'b'], index)).toEqual(['a', 'b', 'c']);
    expect(addMany(['b'], ['zzz', 'a'], index)).toEqual(['b', 'a', 'zzz']);
  });
  it('removes many and keeps the relative order of the rest', () => {
    expect(removeMany(['a', 'b', 'c'], ['b', 'zzz'])).toEqual(['a', 'c']);
    expect(removeMany(['d', 'b', 'a', 'c'], ['b', 'c'])).toEqual(['d', 'a']);
    expect(removeMany(['a'], [])).toEqual(['a']);
  });
  it('sorts a subset by tree index, unknown ids last', () => {
    expect(sortByIndex(['zzz', 'c', 'a'], index)).toEqual(['a', 'c', 'zzz']);
  });
  it('moves within bounds only', () => {
    expect(moveItem(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'nope', 1)).toEqual(['a', 'b', 'c']);
  });
  it('selection key is order-independent', () => {
    expect(selectionKey(['b', 'a'])).toBe(selectionKey(['a', 'b']));
    expect(selectionKey(['b', 'a'])).not.toBe(selectionKey(['a']));
  });
});

describe('course syllabus group', () => {
  function withUnfiledSyllabus(): Cartridge {
    const c = cart();
    c.items = c.items.filter((it) => it.resourceId !== 'syl'); // Canvas puts the Syllabus tab in no module
    c.unfiled = ['f1', 'syl', 'f2'];
    return c;
  }
  it('is null when no unfiled syllabus exists', () => {
    expect(courseGroup(cart())).toBeNull();
  });
  it('lifts the Canvas syllabus out of Unfiled into its own top group', () => {
    const c = withUnfiledSyllabus();
    const g = courseGroup(c);
    expect(g?.title).toBe('Course syllabus');
    expect(g?.children.map((ch) => ch.resourceId)).toEqual(['syl']);
    expect(unfiledGroup(c).children.map((ch) => ch.resourceId)).toEqual(['f2', 'f1']);
    expect(treeOrder(c)[0]).toBe('syl');
  });
});
