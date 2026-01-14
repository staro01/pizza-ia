import { NextResponse, type NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  // Désactive toute logique Clerk pour isoler la cause des 500
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/(api|trpc)(.*)"],
};
