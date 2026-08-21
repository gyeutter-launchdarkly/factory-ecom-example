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
import { PackTheme } from '@/components/PackTheme';
import { demoPack } from '@/lib/demo-pack';
import { DemoPackProvider } from '@/lib/use-demo-pack';

// The tab is on screen when the demo starts, so it names the selected pack's
// store rather than flashing the built-in one.
export async function generateMetadata(): Promise<Metadata> {
  const pack = await demoPack();
  return {
    title: pack.storefront?.brand.name ?? pack.name,
    description: 'LaunchDarkly AutoFactory demo store',
  };
}

// The selected demo pack lives in a host-mounted TUI settings file and can
// change without rebuilding the image, so the root shell cannot be prerendered.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pack = await demoPack();
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
        <DemoPackProvider initial={pack}>
          <PackTheme />
          <CartProvider>
            <Header />
            {/* Bottom padding leaves room for the collapsed factory pane. */}
            <main className="max-w-6xl mx-auto px-6 py-14 pb-28">{children}</main>
            <FactoryPane />
          </CartProvider>
        </DemoPackProvider>
      </body>
    </html>
  );
}
