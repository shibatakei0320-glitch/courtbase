"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { checkin, type CheckinResult } from "./actions";

const LABEL = { IN: "入場", OUT: "退場", REPEAT: "入場済み" } as const;

export function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const busy = useRef(false);
  const [on, setOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [manual, setManual] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = useCallback(
    (value: string) => {
      busy.current = true;
      start(async () => {
        const r = await checkin(value);
        setResult(r);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(r.ok ? 80 : [60, 60, 60]);
        router.refresh();
        busy.current = false;
      });
    },
    [router],
  );

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setCamError(null);
        const tick = () => {
          if (stopped) return;
          const c = canvasRef.current!;
          if (v.readyState === v.HAVE_ENOUGH_DATA && !busy.current) {
            const w = (c.width = v.videoWidth), h = (c.height = v.videoHeight);
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, w, h);
            const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
            const now = Date.now();
            if (code?.data && !(code.data === last.current.value && now - last.current.at < 5000)) {
              last.current = { value: code.data, at: now };
              submit(code.data);
            }
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch {
        setCamError("カメラを起動できませんでした。ブラウザのカメラの許可を確認してください。");
        setOn(false);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, submit]);

  const tone = !result ? "" : !result.ok ? "border-red-300 bg-red-50" : result.action === "OUT" ? "border-slate-300 bg-slate-50" : "border-emerald-300 bg-emerald-50";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card overflow-hidden">
        <div className="relative aspect-[4/3] bg-slate-900">
          <video ref={videoRef} className={`h-full w-full object-cover ${on ? "" : "hidden"}`} playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          {!on && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-300">
              <p>会員証のQRコードをカメラで読み取ります</p>
              <button className="btn-primary" onClick={() => setOn(true)}>カメラを起動</button>
              {camError && <p className="text-red-300">{camError}</p>}
            </div>
          )}
          {on && <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/70" aria-hidden />}
        </div>
        <div className="flex items-center justify-between gap-3 p-3">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) submit(manual.trim());
              setManual("");
            }}
          >
            <input className="input" inputMode="numeric" placeholder="会員番号で受付" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn-secondary" disabled={pending}>受付</button>
          </form>
          {on && <button className="btn-secondary" onClick={() => setOn(false)}>停止</button>}
        </div>
      </div>

      <div className={`card flex min-h-[12rem] flex-col justify-center border-2 p-6 ${tone}`} role="status" aria-live="polite">
        {pending && <p className="text-slate-500">確認中…</p>}
        {!pending && !result && <p className="text-slate-500">読み取ると、ここに結果が表示されます。もう一度読み取ると退場になります。</p>}
        {!pending && result && !result.ok && <p className="text-lg font-bold text-red-700">{result.error}</p>}
        {!pending && result?.ok && (
          <>
            <p className={`text-4xl font-bold ${result.action === "OUT" ? "text-slate-700" : "text-emerald-700"}`}>{LABEL[result.action]}</p>
            <p className="mt-3 text-2xl font-bold">{result.name} さん</p>
            <p className="text-sm text-slate-500">No.{String(result.memberNo).padStart(6, "0")}　{result.at}</p>
            {result.reservation && <p className="mt-3 text-sm">本日の予約：<b>{result.reservation}</b>（出席にしました）</p>}
            {result.warning && <p className="mt-3 font-bold text-amber-700">{result.warning}</p>}
          </>
        )}
      </div>
    </div>
  );
}
