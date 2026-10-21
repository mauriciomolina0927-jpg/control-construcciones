import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Receipt photos are compressed in the phone before upload; PDFs may be larger. Vercel caps a request at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
    // The on-disk build cache got corrupted between steps and crashed clean builds; CI never reuses it anyway.
    turbopackFileSystemCacheForBuild: false,
  },
  // Every page depends on the signed-in user, so nothing is prerendered.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
