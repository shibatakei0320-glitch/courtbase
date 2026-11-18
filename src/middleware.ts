import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/setup", "/login", "/forgot-password", "/reset-password"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isPublic && !req.cookies.has("cb_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = { matcher: ["/((?!_next/|favicon.ico|api/health).*)"] };
