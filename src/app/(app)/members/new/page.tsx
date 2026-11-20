import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MemberForm } from "../MemberForm";
import { createMember } from "../actions";

export const metadata = { title: "新規会員登録" };

export default async function NewMemberPage({ searchParams }: { searchParams: Promise<{ guardian?: string }> }) {
  await requireStaff();
  const { guardian: gid } = await searchParams;
  const [plans, guardian] = await Promise.all([
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    gid ? db.member.findFirst({ where: { id: gid, guardianId: null } }) : null,
  ]);
  return (
    <>
      <PageHeader title={guardian ? "お子さまの会員登録" : "新規会員登録"} back={guardian ? `/members/${guardian.id}` : "/members"} />
      <div className="card max-w-3xl p-6"><MemberForm action={createMember} plans={plans} guardian={guardian} /></div>
    </>
  );
}
