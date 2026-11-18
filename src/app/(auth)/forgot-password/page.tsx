import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { requestReset } from "../actions";

export const metadata = { title: "パスワード再設定" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-2 text-lg font-bold">パスワード再設定</h1>
      <p className="mb-4 text-sm text-slate-600">登録済みのメールアドレスを入力してください。再設定用のURLをお送りします。</p>
      <ActionForm action={requestReset} className="space-y-4">
        <label className="block"><span className="label">メールアドレス</span><input className="input" type="email" name="email" required autoFocus /></label>
        <Submit className="btn-primary w-full">送信する</Submit>
      </ActionForm>
      <p className="mt-4 text-center text-sm"><Link href="/login" className="text-brand-700 hover:underline">ログイン画面へ戻る</Link></p>
    </>
  );
}
