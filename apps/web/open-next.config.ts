// OpenNext adapter: builds the Next.js app into a Cloudflare Worker (`pnpm --filter web cf:build`).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
