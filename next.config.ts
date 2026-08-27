import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.102.36", "localhost"],

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
