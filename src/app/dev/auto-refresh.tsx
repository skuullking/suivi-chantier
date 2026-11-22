"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page periodically (development simulators). */
export function AutoRefresh({ seconds = 2 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
