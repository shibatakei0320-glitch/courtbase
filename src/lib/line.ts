import "server-only";
import { appUrl } from "./url";

export const lineConfigured = () => Boolean(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET);
export const lineCallbackUrl = () => `${appUrl()}/api/line/callback`;

export function lineAuthorizeUrl(state: string, nonce: string) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_CHANNEL_ID!,
    redirect_uri: lineCallbackUrl(),
    state,
    scope: "profile openid",
    nonce,
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${q}`;
}

/** 認可コードをIDトークンに交換し、検証してLINEユーザーID(sub)と表示名を返す */
export async function verifyLineCode(code: string, nonce: string): Promise<{ sub: string; name?: string }> {
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: lineCallbackUrl(),
      client_id: process.env.LINE_CHANNEL_ID!,
      client_secret: process.env.LINE_CHANNEL_SECRET!,
    }),
  });
  if (!tokenRes.ok) throw new Error(`LINE token error ${tokenRes.status}: ${await tokenRes.text()}`);
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) throw new Error("LINE id_token がありません");
  const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token, client_id: process.env.LINE_CHANNEL_ID!, nonce }),
  });
  if (!verifyRes.ok) throw new Error(`LINE verify error ${verifyRes.status}: ${await verifyRes.text()}`);
  const claims = (await verifyRes.json()) as { sub: string; name?: string };
  return { sub: claims.sub, name: claims.name };
}
