import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, sessionClaims } = await auth();

  const role1 = (sessionClaims?.publicMetadata as any)?.role ?? null;
  const role2 = (sessionClaims as any)?.metadata?.role ?? null;
  const role3 = (sessionClaims as any)?.publicMetadata?.role ?? null;

  return NextResponse.json({
    userId: userId ?? null,
    roleFromSessionClaims_publicMetadata: role1,
    roleFromSessionClaims_metadata: role2,
    roleFromSessionClaims_publicMetadata_alt: role3,
    sessionClaimsKeys: sessionClaims ? Object.keys(sessionClaims as any) : null,
  });
}
