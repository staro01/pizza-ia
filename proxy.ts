import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/client(.*)",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sign-out(.*)",
  "/api/twilio(.*)",
  "/api/debug(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  try {
    if (isPublicRoute(req)) return NextResponse.next();

    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const pathname = req.nextUrl.pathname;

    // ✅ lecture "robuste" du role
    const roleRaw =
      (sessionClaims?.publicMetadata as any)?.role ??
      (sessionClaims as any)?.metadata?.role ??
      (sessionClaims as any)?.publicMetadata?.role;

    const role = typeof roleRaw === "string" ? roleRaw.toUpperCase() : null;

    // Si pas de rôle => retour home (bootstrap)
    if (!role) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Admin only
    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Restaurant only
    if (pathname.startsWith("/restaurant") && role !== "RESTAURANT") {
      return NextResponse.redirect(new URL("/", req.url));
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
