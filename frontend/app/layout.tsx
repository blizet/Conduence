import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CoT Decision Graph',
  description: 'Real-time decision graph dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0f1117', color: '#e8eaed' }}>
        {children}
      </body>
    </html>
  );
}
