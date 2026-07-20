import type { ReactNode } from 'react';

export const metadata = {
  title: 'Agent-payable API — @t2000/serve',
  description: 'A paid API agents can discover and pay in USDC on Sui.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#0a0a0a',
          color: '#ededed',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
