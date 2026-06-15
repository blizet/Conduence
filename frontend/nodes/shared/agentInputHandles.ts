import type { HandleConfig } from '../types';

/** Mind agent — bottom input ports without Tools/Memory labels. */
export function mindagentInputHandles(outputId: string): HandleConfig[] {
  return [
    { type: 'target', position: 'left', id: 'in-main' },
    {
      type: 'target',
      position: 'bottom',
      id: 'in-tools',
      multiConnect: true,
      style: { left: '38%' },
    },
    {
      type: 'target',
      position: 'bottom',
      id: 'in-memory',
      style: { left: '62%' },
    },
    { type: 'source', position: 'right', id: outputId },
  ];
}

/** Bottom Tools + Memory ports; main workflow input on the left (no chat-model port). */
export function subagentInputHandles(outputId: string): HandleConfig[] {
  return [
    { type: 'target', position: 'left', id: 'in-main' },
    {
      type: 'target',
      position: 'bottom',
      id: 'in-tools',
      label: 'Tools',
      multiConnect: true,
      style: { left: '38%' },
    },
    {
      type: 'target',
      position: 'bottom',
      id: 'in-memory',
      label: 'Memory',
      style: { left: '62%' },
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
