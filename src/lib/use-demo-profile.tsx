'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { DemoProfile } from './demo-profile';

type ProfileInfo = { profile: DemoProfile; scenarios: string[] };

const DEFAULT: ProfileInfo = { profile: 'commerce', scenarios: [] };
const ProfileContext = createContext<ProfileInfo>(DEFAULT);

/**
 * The TUI can switch storefronts while the browser stays open. Polling this
 * tiny local endpoint avoids a manual refresh and also gives the Factory pane
 * the exact scenario allow-list for the selected customer.
 */
export function DemoProfileProvider({
  initial,
  children,
}: {
  initial: ProfileInfo;
  children: React.ReactNode;
}) {
  const [info, setInfo] = useState<ProfileInfo>(initial);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/demo-profile', { cache: 'no-store' });
        if (!response.ok) return;
        const next = (await response.json()) as ProfileInfo;
        if (alive) setInfo(next);
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
    document.documentElement.dataset.profile = info.profile;
    document.title =
      info.profile === 'cat' ? 'Cat® Parts Store · AutoFactory Demo' : 'DarkCommerce';
  }, [info.profile]);

  return <ProfileContext.Provider value={info}>{children}</ProfileContext.Provider>;
}

export function useDemoProfile(): ProfileInfo {
  return useContext(ProfileContext);
}
