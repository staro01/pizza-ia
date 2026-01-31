import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/client(.*)",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sign-out(.*)",

  // ✅ Twilio + TTS doivent être publics (Twilio n'a pas de cookies)
  "/api/twilio(.*)",
  "/api/tts(.*)",

  // Debug si tu en as besoin
  "/api/debug(.*)",

  // SSE (si tu veux que restaurant dashboard fonctionne sans auth, sinon enlève)
  "/api/orders/stream(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  try {
    // ✅ Public -> on laisse passer sans Clerk
    if (isPublicRoute(req)) return NextResponse.next();

    // ✅ Le reste tu peux garder comme avant
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    return NextResponse.next();
  } catch (err) {
    console.error("proxy.ts middleware error:", err);
    return NextResponse.next();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/(api|trpc)(.*)"],
};
