import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/components/CartProvider';
import { Header } from '@/components/Header';

const font = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700'] });

export const metadata: Metadata = {
  title: 'Meridian',
  description: 'LaunchDarkly AutoFactory demo store',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${font.className} bg-white min-h-screen text-[#0a0a0a]`}>
        <CartProvider>
          <Header />
          <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
