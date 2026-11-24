"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { importSchoolMembers, parseCsv, type ImportReport } from "@/lib/school-import";

export type State = { error?: string; report?: ImportReport } | undefined;

export async function runImport(_: State, fd: FormData): Promise<State> {
  const me = await requireStaff(["OWNER", "ADMIN"]);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "CSVファイルを選んでください" };
  if (file.size > 2_000_000) return { error: "ファイルが大きすぎます" };
  const rows = parseCsv(await file.text());
  if (!rows.length || !("氏名" in rows[0])) return { error: "見出し（氏名・対象・現在の級…）のあるCSVを選んでください" };
  const dryRun = fd.get("dryRun") === "on";
  const report = await importSchoolMembers(rows, { dryRun, generate: fd.get("generate") === "on" });
  if (!dryRun) {
    await audit(me.id, "member.import_school", file.name, `会員${report.members.created}・在籍${report.enrollCurrent + report.enrollJan}・入金${report.paid.count}`);
    revalidatePath("/", "layout");
  }
  return { report };
}
