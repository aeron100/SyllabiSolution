/**
 * Pure helpers over the Cartridge organization tree: ordering, counts,
 * visibility under the kind filter, and selection list edits.
 * No React, no DOM — unit-testable.
 */
import type { Cartridge, Item, Kind } from '../lib/types';
import { KIND_ORDER } from './kinds';

export const UNFILED_ID = '__unfiled__';

function byTitle(cart: Cartridge) {
  return (a: string, b: string): number => {
    const ta = cart.resources.get(a)?.title ?? '';
    const tb = cart.resources.get(b)?.title ?? '';
    const c = ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    return c !== 0 ? c : a < b ? -1 : a > b ? 1 : 0;
  };
}

/** Unfiled resource ids sorted by title (DESIGN.md §10), stable on id. */
export function unfiledIds(cart: Cartridge): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of cart.unfiled) {
    if (cart.resources.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.sort(byTitle(cart));
}

export const COURSE_ID = '__course__';

/** Unfiled resources of kind "syllabus" (the Canvas Syllabus tab), in title order. */
export function courseSyllabusIds(cart: Cartridge): string[] {
  return unfiledIds(cart).filter((id) => cart.resources.get(id)?.kind === 'syllabus');
}

/**
 * A synthetic group shown at the TOP of the tree holding the Canvas Syllabus
 * tab content, so the pre-checked item is visible and can be unchecked
 * (DESIGN.md §10). Null when the export has none.
 */
export function courseGroup(cart: Cartridge): Item | null {
  const ids = courseSyllabusIds(cart);
  if (ids.length === 0) return null;
  return {
    id: COURSE_ID,
    title: 'Course syllabus',
    children: ids.map((id) => ({
      id: `${COURSE_ID}:${id}`,
      title: cart.resources.get(id)?.title ?? id,
      resourceId: id,
      children: [],
    })),
  };
}

/** A synthetic Item for the "Unfiled" group at the bottom of the tree (syllabus kind excluded — see courseGroup). */
export function unfiledGroup(cart: Cartridge): Item {
  return {
    id: UNFILED_ID,
    title: 'Unfiled',
    children: unfiledIds(cart)
      .filter((id) => cart.resources.get(id)?.kind !== 'syllabus')
      .map((id) => ({
        id: `${UNFILED_ID}:${id}`,
        title: cart.resources.get(id)?.title ?? id,
        resourceId: id,
        children: [],
      })),
  };
}

/**
 * Unique resource ids in tree order (depth-first), then Unfiled — with the
 * course syllabus (kind "syllabus") moved to the front so it leads the
 * document by default (DESIGN.md §10 "Sensible defaults").
 */
export function treeOrder(cart: Cartridge): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const walk = (items: Item[]): void => {
    for (const it of items) {
      if (it.resourceId && cart.resources.has(it.resourceId) && !seen.has(it.resourceId)) {
        seen.add(it.resourceId);
        out.push(it.resourceId);
      }
      if (it.children.length) walk(it.children);
    }
  };
  walk(cart.items);
  for (const id of unfiledIds(cart)) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  const isSyllabus = (id: string): boolean => cart.resources.get(id)?.kind === 'syllabus';
  return [...out.filter(isSyllabus), ...out.filter((id) => !isSyllabus(id))];
}

export function orderIndex(order: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  order.forEach((id, i) => m.set(id, i));
  return m;
}

/** Count of unique resources per kind among the ids shown in the tree. */
export function kindCounts(cart: Cartridge, order: readonly string[]): Map<Kind, number> {
  const m = new Map<Kind, number>();
  for (const id of order) {
    const k = cart.resources.get(id)?.kind;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Kinds present, in fixed display order. */
export function kindsPresent(counts: ReadonlyMap<Kind, number>): Kind[] {
  return KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0);
}

/** Ids in tree order whose kind is not hidden by the filter. */
export function visibleIds(cart: Cartridge, order: readonly string[], hidden: ReadonlySet<Kind>): string[] {
  return order.filter((id) => {
    const k = cart.resources.get(id)?.kind;
    return k !== undefined && !hidden.has(k);
  });
}

/** Unique, visible resource ids under an item (the item itself included). */
export function descendantResourceIds(item: Item, cart: Cartridge, hidden: ReadonlySet<Kind>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const walk = (it: Item): void => {
    if (it.resourceId) {
      const res = cart.resources.get(it.resourceId);
      if (res && !hidden.has(res.kind) && !seen.has(it.resourceId)) {
        seen.add(it.resourceId);
        out.push(it.resourceId);
      }
    }
    for (const c of it.children) walk(c);
  };
  walk(item);
  return out;
}

/** Number of top-level items that contain other items ("modules"). */
export function countModules(cart: Cartridge): number {
  return cart.items.filter((it) => it.children.length > 0).length;
}

/**
 * Add `id` to the END of `selected` (DESIGN.md §10: the order of selection is
 * the document order). Already-present ids are left where they are.
 *
 * Historically this inserted at the id's tree-order position; the name is
 * kept for callers, but the behaviour is now a plain append. Reordering
 * happens only on step 3 (moveItem).
 */
export function insertInOrder(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return [...selected];
  return [...selected, id];
}

/** Alias that says what it does. */
export const appendSelection = insertInOrder;

/**
 * Add many ids: the ones not yet selected are appended, in tree order among
 * themselves, AFTER everything already selected; the existing order is never
 * touched ("Select all shown", a module's tri-state checkbox).
 */
export function addMany(selected: readonly string[], ids: readonly string[], index: ReadonlyMap<string, number>): string[] {
  const have = new Set(selected);
  const missing: string[] = [];
  for (const id of ids) {
    if (have.has(id)) continue;
    have.add(id);
    missing.push(id);
  }
  if (missing.length === 0) return [...selected];
  return [...selected, ...sortByIndex(missing, index)];
}

/** Drop `ids` from `selected`; the rest keep their relative order. */
export function removeMany(selected: readonly string[], ids: readonly string[]): string[] {
  const drop = new Set(ids);
  return selected.filter((id) => !drop.has(id));
}

/** Tree-order sort (ids unknown to the index go last, stable). Used only for the subset a bulk add appends. */
export function sortByIndex(ids: readonly string[], index: ReadonlyMap<string, number>): string[] {
  return [...ids].sort((a, b) => {
    const ia = index.get(a) ?? Number.POSITIVE_INFINITY;
    const ib = index.get(b) ?? Number.POSITIVE_INFINITY;
    return ia === ib ? 0 : ia < ib ? -1 : 1;
  });
}

/** Move one id up (-1) or down (+1). Returns the same array when at the edge. */
export function moveItem(list: readonly string[], id: string, dir: -1 | 1): string[] {
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Order-independent key for the current selection (cache key material). */
export function selectionKey(selected: readonly string[]): string {
  return [...selected].sort().join('|');
}
