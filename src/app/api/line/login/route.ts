import { NextResponse } from "next/server";
import { newToken } from "@/lib/tokens";
import { lineAuthorizeUrl, lineConfigured } from "@/lib/line";
import { appUrl } from "@/lib/url";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!lineConfigured()) return NextResponse.redirect(`${appUrl()}/my/login?error=config`);
  const state = newToken();
  const nonce = newToken();
  const res = NextResponse.redirect(lineAuthorizeUrl(state, nonce));
  res.cookies.set("pl_line_state", `${state}.${nonce}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
