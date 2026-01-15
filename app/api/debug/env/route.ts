import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const sk = process.env.CLERK_SECRET_KEY ?? "";

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,

    hasPublishableKey: Boolean(pk),
    hasSecretKey: Boolean(sk),

    // safe hint (ne leak pas la clé)
    publishableKeyPrefix: pk ? pk.slice(0, 8) : null,
    secretKeyPrefix: sk ? sk.slice(0, 8) : null,
  });
}
