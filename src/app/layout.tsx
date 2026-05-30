import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FluxDHCP',
  description: 'DHCP Server Management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body style={{ background: '#f8fafc', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
