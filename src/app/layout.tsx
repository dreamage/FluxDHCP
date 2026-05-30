import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-dm-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

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
    <html className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: `
          #splash{position:fixed;inset:0;z-index:99999;background:#f8fafc;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
          #splash .logo{font-size:28px;font-weight:700;color:#0ea5e9;letter-spacing:-0.02em}
          #splash .bar{width:120px;height:3px;background:#e2e8f0;border-radius:2px;overflow:hidden}
          #splash .bar::after{content:'';display:block;width:40%;height:100%;background:#0ea5e9;border-radius:2px;animation:slide 1.2s ease-in-out infinite}
          @keyframes slide{0%{transform:translateX(-100%)}50%{transform:translateX(150%)}100%{transform:translateX(-100%)}}
        `}} />
      </head>
      <body style={{ background: '#f8fafc', margin: 0 }}>
        <div id="splash">
          <div className="logo">FluxDHCP</div>
          <div className="bar" />
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
          window.__splash_hide=function(){var s=document.getElementById('splash');if(s)s.style.display='none'};
          setTimeout(window.__splash_hide,3000);
        `}} />
        {children}
      </body>
    </html>
  );
}
