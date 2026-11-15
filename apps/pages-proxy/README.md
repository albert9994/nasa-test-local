# hotar.pages.dev

A Cloudflare Pages project whose only job is to forward requests to the Hotar Worker (`apps/web`, deployed with
`pnpm --filter web cf:deploy` to `hotar.<account>.workers.dev`). No build step.

```bash
pnpm --filter web exec wrangler pages deploy ../pages-proxy/public --project-name hotar --branch main
```

Run that from the repo root (wrangler picks up `functions/` next to `public/`), after the Worker is deployed. Change `ORIGIN`
in `functions/[[path]].js` if the Worker moves (e.g. to a custom domain).
