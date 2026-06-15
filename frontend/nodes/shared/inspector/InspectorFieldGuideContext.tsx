'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type InspectorFieldGuideContextValue = {
  activeField: string | null;
  setActiveField: (field: string | null) => void;
};

const InspectorFieldGuideContext = createContext<InspectorFieldGuideContextValue | null>(null);

type InspectorFieldGuideProviderProps = {
  nodeId: string;
  children: ReactNode;
};

export function InspectorFieldGuideProvider({ nodeId, children }: InspectorFieldGuideProviderProps) {
  const [activeField, setActiveField] = useState<string | null>(null);

  useEffect(() => {
    setActiveField(null);
  }, [nodeId]);

  const value = useMemo(
    () => ({
      activeField,
      setActiveField,
    }),
    [activeField],
  );

  return (
    <InspectorFieldGuideContext.Provider value={value}>{children}</InspectorFieldGuideContext.Provider>
  );
}

export function useInspectorFieldGuide() {
  return useContext(InspectorFieldGuideContext);
}

export function useGuideFieldFocus(guideField: string) {
  const ctx = useInspectorFieldGuide();
  const activate = useCallback(() => ctx?.setActiveField(guideField), [ctx, guideField]);

  return {
    onFocus: activate,
    onMouseDown: (event: React.MouseEvent) => {
      if (event.button === 0) activate();
    },
  };
}

export function useGuideFieldActive(guideField: string) {
  const ctx = useInspectorFieldGuide();
  return ctx?.activeField === guideField;
}
