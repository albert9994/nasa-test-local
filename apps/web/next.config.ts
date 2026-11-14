import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Shared UI lives in packages/ui (also used by the Tauri desktop app); `@/` resolves there (tsconfig paths).
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
