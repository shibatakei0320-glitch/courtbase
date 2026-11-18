import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyLineCode } from "@/lib/line";
import { createMemberSession, LINE_PENDING_COOKIE, sign } from "@/lib/member-auth";
import { appUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = appUrl();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const [savedState, nonce] = (req.cookies.get("pl_line_state")?.value ?? "").split(".");
  if (!code || !state || !savedState || state !== savedState || !nonce) {
    return NextResponse.redirect(`${base}/my/login?error=state`);
  }
  let profile: { sub: string; name?: string };
  try {
    profile = await verifyLineCode(code, nonce);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${base}/my/login?error=line`);
  }
  const member = await db.member.findUnique({ where: { lineUserId: profile.sub } });
  let res: NextResponse;
  if (member && member.status !== "WITHDRAWN") {
    res = NextResponse.redirect(`${base}/my`);
    await createMemberSession(member.id, res.cookies);
  } else if (member) {
    res = NextResponse.redirect(`${base}/my/login?error=withdrawn`);
  } else {
    res = NextResponse.redirect(`${base}/my/register`);
    res.cookies.set(LINE_PENDING_COOKIE, sign({ sub: profile.sub, name: profile.name, exp: Date.now() + 30 * 60_000 }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 1800,
    });
  }
  res.cookies.delete("pl_line_state");
  return res;
}
