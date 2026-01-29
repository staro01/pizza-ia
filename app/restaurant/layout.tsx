import { currentUser } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function RestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (!user) {
    return (
      <pre style={{ padding: 16 }}>
        NO USER (currentUser() = null)
      </pre>
    );
  }

  const rawRole = (user.publicMetadata as any)?.role;
  const role = String(rawRole ?? "").toUpperCase();

  return (
    <div style={{ padding: 16 }}>
      <pre>
        userId: {user.id}
        {"\n"}rawRole: {String(rawRole)}
        {"\n"}roleNormalized: {role}
      </pre>

      <hr style={{ margin: "16px 0" }} />

      {children}
    </div>
  );
}
