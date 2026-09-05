import type { Kind } from '../../lib/types';
import { KIND_ICON, KIND_LABEL } from '../../ui/kinds';

export interface KindTagProps {
  kind: Kind;
  className?: string;
}

/** Kind pill: icon + text label + per-kind hue. Never color alone (DESIGN.md §10). */
export default function KindTag({ kind, className = '' }: KindTagProps) {
  return (
    <span className={`kind-tag kind-${kind} ${className}`.trim()}>
      <i className={`bi ${KIND_ICON[kind]}`} aria-hidden="true" />
      <span className="kind-tag-label">{KIND_LABEL[kind]}</span>
    </span>
  );
}
