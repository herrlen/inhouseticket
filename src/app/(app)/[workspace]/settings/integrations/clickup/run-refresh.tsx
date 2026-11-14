"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While a sync runs, re-renders the server page every few seconds so the counts move. */
export function RunRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
