'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const Playground = dynamic(
  () => import('@/components/playground/Playground').then((mod) => mod.Playground),
  {
    ssr: false,
    loading: () => (
      <div className="playground-loading">
        <span>Loading workflow canvas…</span>
      </div>
    ),
  },
);

export default function Page() {
  return (
    <Suspense fallback={<div className="playground-loading"><span>Loading workflow canvas…</span></div>}>
      <Playground />
    </Suspense>
  );
}
