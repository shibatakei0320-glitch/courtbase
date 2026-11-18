import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// スタッフは管理画面へ、それ以外（会員）は会員ページへ
export default async function Home() {
  redirect((await cookies()).has("cb_session") ? "/dashboard" : "/my");
}
