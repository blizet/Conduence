'use client';

import type { PaletteItem } from '@/nodes/types';

type IconProps = { size?: number };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Svg({ size = 13, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" {...stroke}>
      {children}
    </svg>
  );
}

const ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  workflowOutput: (p) => (
    <Svg {...p}>
      <rect x="2" y="3" width="12" height="8" rx="1.5" />
      <path d="M6 14h4M8 11v3" />
    </Svg>
  ),
  clob: (p) => (
    <Svg {...p}>
      <path d="M3 3v10h10" />
      <path d="M5 9l2.5-2.5L10 9l3-3.5" />
    </Svg>
  ),
  kalshi: (p) => (
    <Svg {...p}>
      <path d="M3 4h10v8H3z" />
      <path d="M6 7h4M6 9.5h2.5" />
    </Svg>
  ),
  paperTrading: (p) => (
    <Svg {...p}>
      <path d="M2 4h12v9H2z" />
      <path d="M5 7h6M5 9.5h4" />
    </Svg>
  ),
  telegram: (p) => (
    <Svg {...p}>
      <path d="M2.5 7.5L13 3.5 10.5 13.5 7.5 9.5 5.5 11.5 4.5 9.5 7.5 7.5 2.5 7.5z" />
    </Svg>
  ),
  coinmarketcap: (p) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v6M6.3 6.3h2.5a1.2 1.2 0 010 2.4H6.8" />
    </Svg>
  ),
  defillama: (p) => (
    <Svg {...p}>
      <path d="M3 13V8M7 13V4M11 13V6M15 13H1" />
    </Svg>
  ),
  cryptonews: (p) => (
    <Svg {...p}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M5 6h6M5 8.5h6M5 11h3.5" />
    </Svg>
  ),
  cryptoquant: (p) => (
    <Svg {...p}>
      <path d="M1.5 9.5h3l2-5 3 7 2-4h3" />
    </Svg>
  ),
  tavily: (p) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  ),
  coingecko: (p) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="6" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M8 11c1.5 0 3-.6 4-1.8" />
    </Svg>
  ),
  polymarketGamma: (p) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
      <path d="M5 7h4M7 5v4" />
    </Svg>
  ),
  polymarketWallet: (p) => (
    <Svg {...p}>
      <rect x="2" y="4.5" width="12" height="8" rx="2" />
      <path d="M10.5 8.5h2" />
      <path d="M2 6.5h12" />
    </Svg>
  ),
  xMonitor: (p) => (
    <Svg {...p}>
      <path d="M3 3l10 10M13 3L3 13" />
    </Svg>
  ),
  walletMonitor: (p) => (
    <Svg {...p}>
      <rect x="2" y="4.5" width="12" height="8" rx="2" />
      <circle cx="6" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M10.5 8.5h2" />
    </Svg>
  ),
  llm: (p) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="4.5" />
      <path d="M8 5.5v2.5l1.8 1.8" />
      <path d="M4.8 3.2L3.2 1.6M11.2 3.2l1.6-1.6M4.8 12.8l-1.6 1.6M11.2 12.8l1.6 1.6" />
    </Svg>
  ),
};

function FallbackDot() {
  return <span className="palette-chip__dot" />;
}

export function getPaletteIcon(type: string, size?: number): React.ReactNode {
  const render = ICONS[type];
  return render ? render({ size }) : <FallbackDot />;
}

/** Mini silhouette matching the canvas shape language, so the palette teaches the grammar. */
export function getChipShapeClass(item: PaletteItem): string {
  if (item.category === 'orchestrator') return 'palette-chip--agent';
  if (item.toolGroup === 'execution' || item.toolGroup === 'socials') return 'palette-chip--execution';
  return 'palette-chip--tool';
}
