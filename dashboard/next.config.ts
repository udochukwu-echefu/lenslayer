import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      { source: "/signin", destination: "/", permanent: false },
      { source: "/auth/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
