import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/components/CartProvider';
import { Header } from '@/components/Header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Meridian',
  description: 'LaunchDarkly AutoFactory demo store',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <CartProvider>
          <Header />
          <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
