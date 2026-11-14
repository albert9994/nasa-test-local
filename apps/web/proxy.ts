import { NextResponse, type NextRequest } from "next/server";

/** `/` → `/ro` or `/en`, from Accept-Language (Romanian is the default). */
export function proxy(request: NextRequest) {
  const accepted = (request.headers.get("accept-language") ?? "").split(",").map((p) => p.trim().split(";")[0].toLowerCase());
  const first = accepted.find((l) => l.startsWith("ro") || l.startsWith("en"));
  const locale = first?.startsWith("en") ? "en" : "ro";
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}`;
  return NextResponse.redirect(url, 307);
}

export const config = { matcher: "/" };
