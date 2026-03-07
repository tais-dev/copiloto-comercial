import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ====== UPLOAD: limite de body para Server Actions ======
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // ====== UPLOAD: limite de body para Route Handlers (/api/*) — 50MB para planilhas grandes ======
  middlewareClientMaxBodySize: 50 * 1024 * 1024,
};

export default nextConfig;
