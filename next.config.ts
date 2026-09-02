import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXTAUTH_SECRET: "fallback_secret_for_vercel_that_satisfies_nextauth_78910",
  },
  allowedDevOrigins: ["192.168.102.36", "localhost"],

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
