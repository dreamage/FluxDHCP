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
          #splash{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
          #splash .logo{font-size:28px;font-weight:700;letter-spacing:-0.02em}
          #splash .bar{width:120px;height:3px;border-radius:2px;overflow:hidden}
          #splash .bar::after{content:'';display:block;width:40%;height:100%;border-radius:2px;animation:slide 1.2s ease-in-out infinite}
          @keyframes slide{0%{transform:translateX(-100%)}50%{transform:translateX(150%)}100%{transform:translateX(-100%)}}
          :root #splash{background:#f8fafc}
          :root #splash .logo{color:#0ea5e9}
          :root #splash .bar{background:#e2e8f0}
          :root #splash .bar::after{background:#0ea5e9}
        `}} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var saved='light';
            try{saved=localStorage.getItem('fluxdhcp_theme')||'system'}catch(e){}
            var dark=saved==='dark'||(saved==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);
            if(dark){
              document.documentElement.setAttribute('data-theme','dark');
              var s=document.getElementById('splash');
              if(s){s.style.background='#0f172a';
              var l=s.querySelector('.logo');if(l)l.style.color='#38bdf8';
              var b=s.querySelector('.bar');if(b){b.style.background='#334155';
              var a=b.firstChild||b;}}
            }
          })();
        `}} />
      </head>
      <body style={{ margin: 0, background: 'var(--color-bg)' }}>
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
