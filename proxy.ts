import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const isPublicRoute = createRouteMatcher([
  "/",
  "/client(.*)",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sign-out(.*)",
  "/api/twilio(.*)",
]);

// Si la clé manque, on n'initialise PAS Clerk middleware (sinon ça fait un 500 global)
const fallbackMiddleware = (_req: NextRequest) => NextResponse.next();

const realMiddleware = clerkMiddleware(
  async (auth, req: NextRequest) => {
    try {
      if (isPublicRoute(req)) return NextResponse.next();

      const { userId, sessionClaims } = await auth();

      if (!userId) {
        return NextResponse.redirect(new URL("/sign-in", req.url));
      }

      const pathname = req.nextUrl.pathname;

      const roleRaw = (sessionClaims?.publicMetadata as any)?.role;
      const role = typeof roleRaw === "string" ? roleRaw.toUpperCase() : null;

      if (pathname.startsWith("/admin") && role !== "ADMIN") {
        return NextResponse.redirect(new URL("/restaurant", req.url));
      }

      if (pathname.startsWith("/restaurant") && role !== "RESTAURANT") {
        return NextResponse.redirect(new URL("/admin", req.url));
      }

      return NextResponse.next();
    } catch (err) {
      console.error("proxy.ts middleware error:", err);
      return NextResponse.next();
    }
  },
  // IMPORTANT: on passe explicitement la clé à Clerk
  publishableKey ? { publishableKey } : undefined
);

export default publishableKey ? realMiddleware : fallbackMiddleware;

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/(api|trpc)(.*)"],
};
