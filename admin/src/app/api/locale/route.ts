import { NextResponse, type NextRequest } from "next/server";
import { crossOriginRejected, isSameOrigin } from "@/lib/session/bff";
import { COOKIE_SECURE } from "@/lib/config";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

/** POST /api/locale — remember AR/EN for this browser. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();
  const { locale } = (await request.json().catch(() => ({}))) as {
    locale?: string;
  };
  if (!isLocale(locale)) {
    return NextResponse.json(
      {
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Unknown locale",
        errors: [],
      },
      { status: 422 },
    );
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "strict",
    secure: COOKIE_SECURE,
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
