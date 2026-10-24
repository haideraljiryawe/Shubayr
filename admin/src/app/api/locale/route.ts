import { NextResponse, type NextRequest } from "next/server";
import { crossOriginRejected, forward, isSameOrigin, respond } from "@/lib/session/bff";
import { setLocaleCookie } from "@/lib/session/locale-cookie";
import { isLocale } from "@/i18n/config";

/**
 * POST /api/locale — choose AR/EN.
 *
 * Before sign-in it is remembered for this browser only. From the account
 * menu (`account: true`) it is also saved on the signed-in staff member
 * (PATCH /me `preferred_ui_language`, VIS-004), so it follows them to any
 * browser and a colleague signing in on this one gets their own; the cookie
 * is written only once the API has accepted it.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();
  const { locale, account } = (await request.json().catch(() => ({}))) as {
    locale?: string;
    account?: boolean;
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
  if (account === true) {
    const result = await forward(request, {
      method: "PATCH",
      path: "/me",
      body: JSON.stringify({ preferred_ui_language: locale }),
    });
    if (result.status < 200 || result.status >= 300) return respond(result);
    const response = respond({ ...result, status: 204, body: "" });
    setLocaleCookie(response, locale);
    return response;
  }
  const response = new NextResponse(null, { status: 204 });
  setLocaleCookie(response, locale);
  return response;
}
