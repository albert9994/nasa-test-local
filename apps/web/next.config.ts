import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents/PPR off: on Cloudflare Workers they share promises across requests (unsupported); the site doesn't use "use cache".
  // Shared UI lives in packages/ui (also used by the Tauri desktop app); `@/` resolves there (tsconfig paths).
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // `/` → `/en` when the browser's first language is English, otherwise `/ro` (Romanian first).
  // Done with config redirects instead of middleware so it runs natively on Cloudflare (OpenNext).
  async redirects() {
    return [
      { source: "/", has: [{ type: "header", key: "accept-language", value: "[eE][nN].*" }], destination: "/en", permanent: false },
      { source: "/", destination: "/ro", permanent: false },
    ];
  },
};

export default nextConfig;
