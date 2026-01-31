import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const isPublicRoute = createRouteMatcher([
  "/api/twilio(.*)",
  "/api/tts(.*)",
  "/api/orders/stream(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware((auth, req) => {
  // ✅ Twilio / TTS / SSE doivent être accessibles sans cookie
  if (isPublicRoute(req)) return;

  // ✅ on ne protège rien ici (tu as déjà la protection par layouts server)
  // sinon Clerk peut intercepter et renvoyer du HTML
  return;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
    "/api/(.*)",
  ],
};
