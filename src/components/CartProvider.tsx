'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getTieredDiscount } from '@/lib/pricing';

export interface CartLineItem {
  productId: string;
  name: string;
  emoji: string;
  price: number;
  displayPrice: string;
  quantity: number;
}

interface CartContextValue {
  items: CartLineItem[];
  add: (item: Omit<CartLineItem, 'quantity'>) => void;
  remove: (productId: string) => void;
  update: (productId: string, quantity: number) => void;
  clear: () => void;
  count: number;
  total: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLineItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('darkcommerce-cart');
      if (stored) setItems(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('darkcommerce-cart', JSON.stringify(items));
  }, [items]);

  const add = (item: Omit<CartLineItem, 'quantity'>) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId);
      if (existing) {
        return prev.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const remove = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const update = (productId: string, quantity: number) => {
    if (quantity < 1) return remove(productId);
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    );
  };

  const clear = () => setItems([]);

  const count = items.reduce((n, i) => n + i.quantity, 0);

  // Apply tiered discounts when calculating total
  const total = items.reduce((sum, i) => {
    const discount = getTieredDiscount(i.quantity);
    return sum + i.price * i.quantity * (1 - discount);
  }, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, update, clear, count, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
