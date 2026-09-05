import type { ReactNode } from 'react';

export interface VisuallyHiddenProps {
  children: ReactNode;
  /** Render as a block element instead of an inline span. */
  as?: 'span' | 'div';
  id?: string;
}

/** Text for assistive technology only (Bootstrap's .visually-hidden). */
export function VisuallyHidden({ children, as = 'span', id }: VisuallyHiddenProps) {
  const Tag = as;
  return (
    <Tag id={id} className="visually-hidden">
      {children}
    </Tag>
  );
}
