"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function SignOutPage() {
  const { signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    signOut().then(() => {
      router.push("/sign-in");
    });
  }, [signOut, router]);

  return null;
}
