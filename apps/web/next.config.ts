import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
