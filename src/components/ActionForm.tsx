"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action";

const PendingCtx = createContext(false);

/**
 * サーバーアクション用フォーム。
 * React 19 の form action は送信後に入力値を自動リセットするため、
 * onSubmit から手動で dispatch して入力値を保持する（エラー時に再入力不要）。
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {state?.ok && <div role="status" className="mb-4 break-all rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</div>}
      <PendingCtx.Provider value={pending}>{children}</PendingCtx.Provider>
    </form>
  );
}

export function Submit({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const pending = useContext(PendingCtx);
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "処理中…" : children}
    </button>
  );
}
