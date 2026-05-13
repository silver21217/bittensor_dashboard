import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AAA Live Subnets",
  description:
    "AAA Live Subnets — live Bittensor subnets: alpha prices, emission, incentive burn, 7d charts, risk tags.",
};

// Runs synchronously before React hydrates. Avoids flash of wrong theme.
const themeBoot = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
})();
`;

// Suppress unhandled rejections / errors whose origin is a browser
// extension (wallet injectors, MetaMask/Talisman, page-safety blurs).
// These fire in inpage.js scripts we don't control, and bubble into
// Next.js' dev error overlay as "Failed to connect to MetaMask" etc.
// Anything *our* app throws still surfaces normally.
const extensionErrorSilencer = `
(function(){
  function isExtensionSource(x){
    if (!x) return false;
    var s = '';
    try { s = String(x.stack || x.message || x); } catch(e){}
    return /chrome-extension:|moz-extension:|safari-extension:/i.test(s)
      || /MetaMask extension not found/i.test(s)
      || /Talisman extension has not been configured/i.test(s);
  }
  window.addEventListener('unhandledrejection', function(e){
    if (isExtensionSource(e.reason)) {
      e.preventDefault();
      e.stopImmediatePropagation && e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('error', function(e){
    var src = e.error || e;
    if (isExtensionSource(src) || (e.filename && /chrome-extension:|moz-extension:/i.test(e.filename))) {
      e.preventDefault();
      e.stopImmediatePropagation && e.stopImmediatePropagation();
    }
  }, true);
})();
`;

// Polyfill crypto.randomUUID for HTTP (non-secure) contexts — some browser
// extensions call it at document_start and crash the page otherwise.
const cryptoPolyfill = `
(function(){
  if (typeof crypto === 'undefined') { try { window.crypto = {}; } catch(e) {} }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    try {
      crypto.randomUUID = function() {
        var bytes = new Uint8Array(16);
        if (crypto.getRandomValues) crypto.getRandomValues(bytes);
        else for (var i=0;i<16;i++) bytes[i] = Math.floor(Math.random()*256);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        var h = [];
        for (var j=0;j<16;j++) h.push((bytes[j]+0x100).toString(16).substr(1));
        return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];
      };
    } catch(e) {}
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: extensionErrorSilencer }} />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <script dangerouslySetInnerHTML={{ __html: cryptoPolyfill }} />
      </head>
      {/* `suppressHydrationWarning` on <body>: a browser extension
          (the `gb-*` classes in the stack trace are the fingerprint of a
          page-safety / image-blur extension) mutates body.className
          between the server payload arriving and React hydrating.
          The mismatch is cosmetic and originates from user-installed
          software, not our code, so suppress the warning here. */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
