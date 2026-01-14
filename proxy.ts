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
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  try {
    // Routes publiques
    if (isPublicRoute(req)) return NextResponse.next();

    // IMPORTANT: auth() est async
    const { userId, sessionClaims } = await auth();

    // Pas connecté => sign-in
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const pathname = req.nextUrl.pathname;

    // rôle depuis publicMetadata (Clerk)
    const roleRaw = (sessionClaims?.publicMetadata as any)?.role;
    const role = typeof roleRaw === "string" ? roleRaw.toUpperCase() : null;

    // Admin only
    if (pathname.startsWith("/admin")) {
      if (role !== "ADMIN") {
        return NextResponse.redirect(new URL("/restaurant", req.url));
      }
    }

    // Restaurant only
    if (pathname.startsWith("/restaurant")) {
      if (role !== "RESTAURANT") {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
    }

    return NextResponse.next();
  } catch (err) {
    // FAIL-OPEN : on ne casse pas tout le site
    console.error("proxy.ts middleware error:", err);
    return NextResponse.next();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/(api|trpc)(.*)"],
};
