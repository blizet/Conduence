import type { HandleConfig } from '../types';

/** Left-side Tools + Memory input ports (model selection stays inside the node). */
export function subagentInputHandles(outputId: string): HandleConfig[] {
  return [
    {
      type: 'target',
      position: 'left',
      id: 'in-tools',
      label: 'Tools',
      multiConnect: true,
      style: { top: '36%' },
    },
    {
      type: 'target',
      position: 'left',
      id: 'in-memory',
      label: 'Memory',
      style: { top: '58%' },
    },
    { type: 'source', position: 'right', id: outputId },
  ];
}

export function orchestratorInputHandles(outputCount: number): HandleConfig[] {
  const outputs: HandleConfig[] = Array.from({ length: outputCount }, (_, i) => {
    const pct = ((i + 1) / (outputCount + 1)) * 100;
    return {
      type: 'source',
      position: 'right',
      id: `out-${i}`,
      style: { top: `${pct}%` },
    };
  });

  return [
    {
      type: 'target',
      position: 'left',
      id: 'in-0',
      label: 'Tools',
      multiConnect: true,
      style: { top: '30%' },
    },
    {
      type: 'target',
      position: 'left',
      id: 'in-1',
      label: 'Memory',
      style: { top: '48%' },
    },
    {
      type: 'target',
      position: 'left',
      id: 'in-2',
      label: 'Feed',
      style: { top: '66%' },
    },
    {
      type: 'target',
      position: 'left',
      id: 'in-3',
      label: 'Feed',
      style: { top: '82%' },
    },
    ...outputs,
  ];
}
