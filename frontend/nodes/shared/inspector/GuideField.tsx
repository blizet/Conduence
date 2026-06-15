'use client';

import type { ReactNode } from 'react';
import { useGuideFieldFocus } from './InspectorFieldGuideContext';

type GuideFieldProps = {
  field: string;
  children: ReactNode;
  className?: string;
};

/** Wraps a parameter block so clicking/focusing it selects the matching field guide entry. */
export function GuideField({ field, children, className }: GuideFieldProps) {
  const focus = useGuideFieldFocus(field);
  return (
    <div className={className} {...focus}>
      {children}
    </div>
  );
}
