import { db } from "@/lib/db";
import { defaultTerms } from "@/lib/legal";
import { LegalDoc } from "../Doc";

export const metadata = { title: "利用規約" };

export default async function Terms() {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  return <LegalDoc title="利用規約"><p className="whitespace-pre-wrap">{s?.termsText || defaultTerms(s?.facilityName ?? "pickleland", s?.cancelDeadlineHours ?? 24)}</p></LegalDoc>;
}
