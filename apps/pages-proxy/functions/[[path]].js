// Cloudflare Pages project "hotar" (hotar.pages.dev): forwards every request to the Hotar Worker (OpenNext build of
// apps/web), so the site is reachable on pages.dev too. Redirects that point at the Worker's own host are rewritten
// back to the pages.dev host so visitors stay on this address.
const ORIGIN = "hotar.tavi-doandes.workers.dev";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const publicHost = url.host;
  url.host = ORIGIN;
  url.protocol = "https:";
  const res = await fetch(new Request(url, request), { redirect: "manual" });
  const loc = res.headers.get("location");
  if (!loc || !loc.includes(ORIGIN)) return res;
  const out = new Response(res.body, res);
  out.headers.set("location", loc.replace(`//${ORIGIN}`, `//${publicHost}`));
  return out;
}
