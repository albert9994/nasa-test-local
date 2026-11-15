# hotar.pages.dev

A Cloudflare Pages project whose only job is to forward requests to the Hotar Worker (`apps/web`, deployed with
`pnpm --filter web cf:deploy` to `hotar.<account>.workers.dev`). No build step.

```bash
cd apps/pages-proxy && ../web/node_modules/.bin/wrangler pages deploy public --project-name hotar --branch main
```

Run it from `apps/pages-proxy` (wrangler picks up `functions/` from the working directory), after the Worker is deployed. Change `ORIGIN`
in `functions/[[path]].js` if the Worker moves (e.g. to a custom domain).
