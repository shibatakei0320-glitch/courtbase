import { redirect } from "next/navigation";
import { facilityModeOn } from "@/lib/db";
import Link from "next/link";
import QRCode from "qrcode";
import { requireMember } from "@/lib/member-auth";
import { memberQrValue } from "@/lib/qr-token";

export const metadata = { title: "会員証" };

export default async function MemberCard() {
  const me = await requireMember();
  if (!(await facilityModeOn())) redirect("/my");
  const svg = await QRCode.toString(memberQrValue(me.id), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1A2420", light: "#FFFFFF" } });
  return (
    <div className="space-y-6 pt-2">
      <Link href="/my" className="inline-block px-1 text-xs text-[#1A2420]/55 hover:text-[#1A2420]">← マイページへ</Link>
      <section className="overflow-hidden rounded-2xl bg-[#0B6B4F] text-white">
        <div className="px-6 pb-5 pt-6">
          <p className="text-xs text-white/60">会員証</p>
          <p className="mt-2 text-2xl font-medium tracking-wide">{me.lastName} {me.firstName}</p>
          <p className="mt-1 font-display text-lg tracking-[0.12em] text-[#E3F04B]">No. {String(me.memberNo).padStart(6, "0")}</p>
        </div>
        <div className="bg-white px-10 py-8">
          <div className="mx-auto aspect-square w-full max-w-[16rem] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="入退場用のQRコード" dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </section>
      <p className="px-1 text-xs leading-relaxed text-[#1A2420]/55">
        入場・退場のときに、受付でこの画面を見せてください。画面を明るくすると読み取りやすくなります。会員証はご本人だけがお使いいただけます。
      </p>
      {me.status !== "ACTIVE" && <p className="border-l-2 border-[#C2410C] bg-white px-4 py-3 text-sm">現在、休会中です。ご利用の際は施設スタッフにお声がけください。</p>}
    </div>
  );
}
