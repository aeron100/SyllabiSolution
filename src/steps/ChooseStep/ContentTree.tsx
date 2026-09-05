import { useCallback, useMemo, useState } from 'react';
import type { Cartridge, Item, Kind } from '../../lib/types';
import { HINTS } from '../../ui/copy';
import { kindHint } from '../../ui/kinds';
import { courseGroup, descendantResourceIds, unfiledGroup } from '../../ui/tree';
import KindTag from './KindTag';

export interface ContentTreeProps {
  cart: Cartridge;
  /** 1-based document position by selected resource id (DESIGN.md §10: the order of selection is the document order). */
  positions: ReadonlyMap<string, number>;
  hiddenKinds: Set<Kind>;
  focusedId?: string;
  /** A row was checked or unchecked; `title` is the row's title as shown, for the step's status line. */
  onToggle: (id: string, on: boolean, title: string) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
  /** A title was picked; `source` is the button pressed, so the step can keep its row in view. */
  onFocus: (id: string, source?: HTMLElement) => void;
}

interface Ctx extends ContentTreeProps {
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (key: string) => void;
}

/** DOM-safe id from a tree path key. */
function domId(prefix: string, key: string): string {
  return `choose-${prefix}-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/**
 * One selectable row: a 44 px checkbox target, the position badge when the
 * page is selected, kind pill, title-as-preview-button, optional hint. The
 * badge is decorative (aria-hidden); the position is part of the checkbox's
 * accessible name instead ("Include Welcome, position 3 of 7"), so it is
 * never conveyed by the badge alone.
 */
function Row({ item, path, ctx }: { item: Item; path: string; ctx: Ctx }) {
  const id = item.resourceId as string;
  const res = ctx.cart.resources.get(id);
  if (!res || ctx.hiddenKinds.has(res.kind)) return null;
  const position = ctx.positions.get(id);
  const checked = position !== undefined;
  const focused = ctx.focusedId === id;
  const title = item.title || res.title;
  const hint = kindHint(res);
  const cbId = domId('cb', path);
  const hintId = domId('hint', path);
  const label = checked ? `Include ${title}, position ${position} of ${ctx.positions.size}` : `Include ${title}`;
  return (
    <li className={`tree-row${focused ? ' is-focused' : ''}`}>
      {/* A 44 px label around the 24 px box: the whole square toggles (DESIGN.md §10 "44 × 44 px"). */}
      <label className="tree-check" htmlFor={cbId}>
        <input
          type="checkbox"
          className="form-check-input"
          id={cbId}
          checked={checked}
          onChange={(e) => ctx.onToggle(id, e.currentTarget.checked, title)}
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
        />
      </label>
      {checked && (
        <span className="pos-badge tnum" aria-hidden="true">
          {position}
        </span>
      )}
      <KindTag kind={res.kind} />
      <button type="button" className="tree-title" aria-pressed={focused} onClick={(e) => ctx.onFocus(id, e.currentTarget)}>
        <span className="visually-hidden">Preview </span>
        {title}
      </button>
      {hint && (
        <span className="tree-hint" id={hintId}>
          {hint}
        </span>
      )}
    </li>
  );
}

/** A module: disclosure button, tri-state checkbox, title, "n/m" count, then its rows. */
function Group({ item, path, ctx }: { item: Item; path: string; ctx: Ctx }) {
  const ids = descendantResourceIds(item, ctx.cart, ctx.hiddenKinds);
  if (ids.length === 0) return null;
  const selCount = ids.filter((id) => ctx.positions.has(id)).length;
  const all = selCount === ids.length;
  const some = selCount > 0 && !all;
  const open = !ctx.collapsed.has(path);
  const panelId = domId('grp', path);
  const cbId = domId('gcb', path);
  const titleId = domId('gt', path);
  return (
    <li className="tree-group">
      <div className="tree-group-head">
        <button
          type="button"
          className="tree-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${item.title}`}
          onClick={() => ctx.toggleCollapsed(path)}
        >
          <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'}`} aria-hidden="true" />
        </button>
        <label className="tree-check" htmlFor={cbId}>
          <input
            type="checkbox"
            className="form-check-input"
            id={cbId}
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = some;
            }}
            onChange={() => ctx.onToggleMany(ids, !all)}
            aria-label={`Include all in ${item.title}`}
          />
        </label>
        <span className="tree-group-title" id={titleId}>
          {item.title}
        </span>
        <span className="tree-count tnum">
          <span className="visually-hidden">, </span>
          {selCount}/{ids.length}
          <span className="visually-hidden"> selected</span>
        </span>
      </div>
      <ul id={panelId} className="tree-children" aria-labelledby={titleId} hidden={!open}>
        {item.resourceId && <Row item={{ ...item, children: [] }} path={`${path}.self`} ctx={ctx} />}
        {item.children.map((child, i) => (
          <Node key={`${path}.${i}`} item={child} path={`${path}.${i}`} ctx={ctx} />
        ))}
      </ul>
    </li>
  );
}

function Node({ item, path, ctx }: { item: Item; path: string; ctx: Ctx }) {
  if (item.children.length > 0) return <Group item={item} path={path} ctx={ctx} />;
  if (item.resourceId) return <Row item={item} path={path} ctx={ctx} />;
  return <li className="tree-subheader">{item.title}</li>;
}

/**
 * The organization tree as nested checkbox groups with disclosure buttons
 * (DESIGN.md §9a 2.1.1: no custom ARIA tree, so no special key handling).
 * Modules get a tri-state checkbox; header-only items are subheaders;
 * "Unfiled" sits at the bottom. Hidden kinds are not rendered but keep
 * their selection.
 */
/**
 * Initial disclosure state: only the first module with visible rows starts
 * open; every other module and "Unfiled" start collapsed, so a large export
 * (hundreds of rows) is a short list of modules rather than one long page.
 */
function initialCollapsed(cart: Cartridge, hiddenKinds: ReadonlySet<Kind>): Set<string> {
  const collapsed = new Set<string>(['unfiled']);
  let firstOpenFound = false;
  cart.items.forEach((item, i) => {
    if (item.resourceId || item.children.length === 0) return; // rows and subheaders, not groups
    if (descendantResourceIds(item, cart, hiddenKinds).length === 0) return;
    if (!firstOpenFound) {
      firstOpenFound = true;
      return;
    }
    collapsed.add(`m${i}`);
  });
  return collapsed;
}

export default function ContentTree(props: ContentTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => initialCollapsed(props.cart, props.hiddenKinds));
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const ctx: Ctx = { ...props, collapsed, toggleCollapsed };
  const unfiled = useMemo(() => unfiledGroup(props.cart), [props.cart]);
  const course = useMemo(() => courseGroup(props.cart), [props.cart]);

  const anyVisible =
    props.cart.items.some((it) => descendantResourceIds(it, props.cart, props.hiddenKinds).length > 0) ||
    descendantResourceIds(unfiled, props.cart, props.hiddenKinds).length > 0 ||
    (course !== null && descendantResourceIds(course, props.cart, props.hiddenKinds).length > 0);

  if (!anyVisible) {
    return <p className="sg-empty choose-tree-empty">{HINTS.treeEmpty} Open Content types above to turn a type back on.</p>;
  }

  // The scrollable pane around this (ChooseStep) is the sheet; this is just the stack of cards on it.
  return (
    <div className="choose-tree">
      <ul className="tree" aria-label="Course content">
        {course && <Group item={course} path="course" ctx={ctx} />}
        {props.cart.items.map((item, i) => (
          <Node key={`m${i}`} item={item} path={`m${i}`} ctx={ctx} />
        ))}
        {unfiled.children.length > 0 && <Group item={unfiled} path="unfiled" ctx={ctx} />}
      </ul>
    </div>
  );
}
