import type { Metadata } from 'next';
// Self-hosted Inter. next/font/google fetches the CSS at build time and its
// loader dies on an unexpected response, which breaks `docker compose build`
// even when Google is reachable. These ship the woff2 files in node_modules, so
// the build needs no network.
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './globals.css';
import { CartProvider } from '@/components/CartProvider';
import { Header } from '@/components/Header';
import { FactoryPane } from '@/components/FactoryPane';

export const metadata: Metadata = {
  title: 'DarkCommerce',
  description: 'LaunchDarkly AutoFactory demo store',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* Apply the stored theme before first paint so switching does not
            flash the default. Light unless dark was explicitly chosen. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('darkcommerce-theme');" +
              "document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body className="bg-cream min-h-screen text-ink antialiased">
        <CartProvider>
          <Header />
          {/* Bottom padding leaves room for the collapsed factory pane. */}
          <main className="max-w-6xl mx-auto px-6 py-14 pb-28">{children}</main>
          <FactoryPane />
        </CartProvider>
      </body>
    </html>
  );
}
