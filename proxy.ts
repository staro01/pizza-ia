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

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    // ✅ On ne fait PLUS de contrôle de rôle ici
    return NextResponse.next();
  } catch (err) {
    console.error("proxy.ts middleware error:", err);
    return NextResponse.next();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/(api|trpc)(.*)"],
};
