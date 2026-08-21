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
import { demoProfile, PROFILE_SCENARIOS } from '@/lib/demo-profile';
import { DemoProfileProvider } from '@/lib/use-demo-profile';

export const metadata: Metadata = {
  title: 'DarkCommerce',
  description: 'LaunchDarkly AutoFactory demo store',
};

// The selected storefront lives in a host-mounted TUI settings file and can
// change without rebuilding the image, so the root shell cannot be prerendered.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await demoProfile();
  return (
    <html lang="en" data-theme="light" data-profile={profile}>
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
        <DemoProfileProvider initial={{ profile, scenarios: [...PROFILE_SCENARIOS[profile]] }}>
          <CartProvider>
            <Header />
            {/* Bottom padding leaves room for the collapsed factory pane. */}
            <main className="max-w-6xl mx-auto px-6 py-14 pb-28">{children}</main>
            <FactoryPane />
          </CartProvider>
        </DemoProfileProvider>
      </body>
    </html>
  );
}
