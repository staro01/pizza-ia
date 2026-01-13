// proxy.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims, redirectToSignIn } = await auth();

  const pathname = req.nextUrl.pathname;
  const isAdmin = pathname.startsWith("/admin");
  const isRestaurant = pathname.startsWith("/restaurant");

  // On protège seulement /admin et /restaurant
  if ((isAdmin || isRestaurant) && !userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  const role = (sessionClaims?.publicMetadata as any)?.role;

  // /admin -> ADMIN only
  if (isAdmin && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/restaurant", req.url));
  }

  // /restaurant -> RESTAURANT ou ADMIN
  if (isRestaurant && role !== "RESTAURANT" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Toujours pour les API routes
    "/(api|trpc)(.*)",
  ],
};
