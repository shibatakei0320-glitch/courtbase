import Link from "next/link";
export default function Forbidden() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-2xl font-bold">権限がありません</h1>
      <p className="mt-2 text-slate-600">この画面を表示する権限がありません。管理者にお問い合わせください。</p>
      <Link href="/dashboard" className="btn-primary mt-6">ダッシュボードへ</Link>
    </div>
  );
}
