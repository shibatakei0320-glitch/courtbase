"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 受信箱を一定間隔で再読み込み（入力中のフォームは保持される） */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
