import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

// Middleware Clerk “fail-open” : si Clerk plante (env/edge/etc.), on laisse passer
export default clerkMiddleware((auth, req) => {
  try {
    // Ici tu peux mettre tes règles plus tard.
    // Pour l’instant on ne bloque rien tant qu’on stabilise.
    return NextResponse.next();
  } catch (err) {
    console.error("MIDDLEWARE ERROR:", err);
    return NextResponse.next();
  }
});

export const config = {
  matcher: [
    // Tout sauf fichiers statiques + _next
    "/((?!.*\\..*|_next).*)",
    // API routes
    "/(api|trpc)(.*)",
  ],
};
