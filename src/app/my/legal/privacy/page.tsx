import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { defaultPrivacy } from "@/lib/legal";
import { LegalDoc } from "../Doc";

export const metadata = { title: "プライバシーポリシー" };

export default async function Privacy() {
  const s = await db.setting.findUnique({ where: { id: 1 } });
  const contact = s?.legalEmail || s?.contactEmail;
  return (
    <LegalDoc title="プライバシーポリシー">
      <p className="whitespace-pre-wrap">{s?.privacyText || defaultPrivacy(s?.facilityName ?? BRAND)}</p>
      {contact && <p className="mt-4">連絡先：{contact}</p>}
    </LegalDoc>
  );
}
