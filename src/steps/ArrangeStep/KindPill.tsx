import type { Kind } from '../../lib/types';
import { KIND_ICON, KIND_LABEL } from '../../ui/kinds';

/** Kind pill: icon + text label + hue. Never color alone (DESIGN.md §10). */
export function KindPill({ kind }: { kind: Kind }) {
  return (
    <span className={`kind-tag kind-${kind}`}>
      <i className={`bi ${KIND_ICON[kind]}`} aria-hidden="true" />
      <span className="kind-tag-label">{KIND_LABEL[kind]}</span>
    </span>
  );
}
