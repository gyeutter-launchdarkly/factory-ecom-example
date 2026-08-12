import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/components/CartProvider';
import { Header } from '@/components/Header';
import { FactoryPane } from '@/components/FactoryPane';

const font = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600'] });

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
      <body className={`${font.className} bg-cream min-h-screen text-ink antialiased`}>
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
