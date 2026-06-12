import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Conduence',
  description: 'Visual workflow builder for agent pipelines',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="playground-root">{children}</body>
    </html>
  );
}
