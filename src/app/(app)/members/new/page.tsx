import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MemberForm } from "../MemberForm";
import { createMember } from "../actions";

export const metadata = { title: "新規会員登録" };

export default async function NewMemberPage() {
  await requireStaff();
  const plans = await db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader title="新規会員登録" back="/members" />
      <div className="card max-w-3xl p-6"><MemberForm action={createMember} plans={plans} /></div>
    </>
  );
}
