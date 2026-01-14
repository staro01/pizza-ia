// proxy.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims, redirectToSignIn } = await auth();

  const pathname = req.nextUrl.pathname;

  const isAdminRoute = pathname.startsWith("/admin");
  const isRestaurantRoute = pathname.startsWith("/restaurant");

  // Protéger seulement /admin et /restaurant
  if ((isAdminRoute || isRestaurantRoute) && !userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  const role = (sessionClaims?.publicMetadata as any)?.role;

  // /admin -> ADMIN only
  if (isAdminRoute && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/restaurant", req.url));
  }

  // /restaurant -> RESTAURANT ou ADMIN
  if (isRestaurantRoute && role !== "RESTAURANT" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
