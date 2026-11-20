import { BRAND, BRAND_MARK } from "@/lib/brand";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">{BRAND_MARK}</div>
          <p className="text-lg font-bold text-slate-800">{BRAND} 管理画面</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}
