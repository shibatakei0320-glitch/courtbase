import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { ImportForm } from "./Form";

export const metadata = { title: "会費管理表から取り込み" };

export default async function ImportSchoolPage() {
  await requireStaff(["OWNER", "ADMIN"]);
  return (
    <>
      <PageHeader title="会費管理表から取り込み" back="/members" />
      <div className="max-w-3xl space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          会費管理表を整えたCSV（氏名・ヨミガナ・対象・現在の級・曜日・時間・形態・月会費・1月からのクラス・入金4月〜11月）を取り込みます。
          12月までは今のクラス（「【〜12月】」のクラス）に、1月からはホームページの時間割のクラスに在籍を登録し、入金日のある月は月謝を入金済みにします。
          もう一度取り込んでも、同じ会員・在籍・月謝は重複しません。
        </p>
        <ImportForm />
      </div>
    </>
  );
}
