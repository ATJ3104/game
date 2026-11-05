"use client";

import { useEffect } from "react";

/** Service Worker を登録（本番のみ。開発中はキャッシュで混乱しないよう登録しない） */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
