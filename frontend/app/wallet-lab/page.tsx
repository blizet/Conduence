'use client';

import dynamic from 'next/dynamic';

const WalletGraphLab = dynamic(
  () => import('@/components/wallet-lab/WalletGraphLab').then((mod) => mod.WalletGraphLab),
  {
    ssr: false,
    loading: () => (
      <div className="playground-loading">
        <span>Loading wallet graph lab…</span>
      </div>
    ),
  },
);

export default function WalletLabPage() {
  return <WalletGraphLab />;
}
