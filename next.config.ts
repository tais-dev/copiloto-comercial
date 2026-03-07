import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ====== UPLOAD: limite de body para Server Actions ======
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
