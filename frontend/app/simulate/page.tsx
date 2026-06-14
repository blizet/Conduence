'use client';

import dynamic from 'next/dynamic';

const SimulateApp = dynamic(
  () => import('@/components/simulate/SimulateApp').then((mod) => mod.SimulateApp),
  {
    ssr: false,
    loading: () => (
      <div className="playground-loading">
        <span>Loading paper trading…</span>
      </div>
    ),
  },
);

export default function SimulatePage() {
  return <SimulateApp />;
}
