import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const form = await req.formData();
  const role = String(form.get("role") ?? "").toUpperCase();

  if (role !== "ADMIN" && role !== "RESTAURANT") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // ✅ Clerk client async
  const client = await clerkClient();

  // On autorise seulement si l'utilisateur n'a pas encore de rôle (bootstrap)
  const user = await client.users.getUser(userId);
  const currentRole = (user.publicMetadata as any)?.role;

  if (currentRole) {
    return NextResponse.json(
      { error: "Role already set", currentRole },
      { status: 403 }
    );
  }

  await client.users.updateUser(userId, {
    publicMetadata: {
      ...(user.publicMetadata as Record<string, unknown>),
      role,
    },
  });

  return NextResponse.redirect(new URL("/", req.url));
}
