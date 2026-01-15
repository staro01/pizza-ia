import { auth, currentUser } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId, sessionClaims } = await auth();
  const user = userId ? await currentUser() : null;

  const roleRaw =
    (sessionClaims?.publicMetadata as any)?.role ??
    (user?.publicMetadata as any)?.role;

  const role = typeof roleRaw === "string" ? roleRaw : null;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Pizza IA</h1>

      <p>
        <strong>Connecté :</strong> {userId ? "oui" : "non"}
      </p>
      <p>
        <strong>Email :</strong> {user?.emailAddresses?.[0]?.emailAddress ?? "—"}
      </p>
      <p>
        <strong>Rôle (publicMetadata.role) :</strong> {role ?? "— (manquant)"}
      </p>

      {!userId ? (
        <p>
          Va sur <code>/sign-in</code> pour te connecter.
        </p>
      ) : !role ? (
        <>
          <p style={{ marginTop: 16 }}>
            Ton rôle n’est pas défini → c’est pour ça que <code>/admin</code> et{" "}
            <code>/restaurant</code> ne peuvent pas fonctionner.
          </p>

          <form action="/api/admin/set-role" method="POST" style={{ marginTop: 16 }}>
            <input type="hidden" name="role" value="ADMIN" />
            <button type="submit">Me mettre ADMIN</button>
          </form>

          <form action="/api/admin/set-role" method="POST" style={{ marginTop: 12 }}>
            <input type="hidden" name="role" value="RESTAURANT" />
            <button type="submit">Me mettre RESTAURANT</button>
          </form>

          <p style={{ marginTop: 16, opacity: 0.7 }}>
            (Boutons temporaires pour bootstrap)
          </p>
        </>
      ) : (
        <p style={{ marginTop: 16 }}>
          Tu as un rôle → teste <code>/admin</code> ou <code>/restaurant</code>.
        </p>
      )}
    </main>
  );
}
