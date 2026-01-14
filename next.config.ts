import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // IMPORTANT: ne pas utiliser output: "export" sur une app avec auth (Clerk) + API + server actions
  // output: "export",

  // (optionnel) garde tout simple tant qu'on debug
};

export default nextConfig;
