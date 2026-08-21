'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { DemoPack } from './demo-pack';

const FALLBACK: DemoPack = {
  id: 'default',
  name: 'DarkCommerce',
  visibility: 'public',
  scenarios: [],
};
const PackContext = createContext<DemoPack>(FALLBACK);

export function DemoPackProvider({
  initial,
  children,
}: {
  initial: DemoPack;
  children: React.ReactNode;
}) {
  const [pack, setPack] = useState(initial);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/demo-pack', { cache: 'no-store' });
        if (response.ok && alive) setPack((await response.json()) as DemoPack);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const store = pack.storefront?.brand.name ?? pack.name;
    document.title = `${store} · AutoFactory Demo`;
  }, [pack.name, pack.storefront?.brand.name]);

  return <PackContext.Provider value={pack}>{children}</PackContext.Provider>;
}

export function useDemoPack(): DemoPack {
  return useContext(PackContext);
}
