#!/usr/bin/env node
// Copies the desktop installers of a GitHub release into apps/web/public/downloads/ under stable names, so the website
// can serve them (the repository is private, so release links would not work for visitors). Run before `pnpm cf:build`:
//   node scripts/fetch-installers.mjs            # version from apps/desktop/package.json
//   node scripts/fetch-installers.mjs 2.1.0
// Needs the GitHub CLI (`gh`) signed in with access to the repository. downloads/ is git-ignored.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2] ?? JSON.parse(readFileSync(path.join(root, "apps/desktop/package.json"), "utf8")).version;
const out = path.join(root, "apps/web/public/downloads");
const tmp = path.join(out, ".tmp");

// release asset (Tauri naming, without the product-name prefix) -> stable name used by the website.
// Releases before the rebrand (<= 2.1.0) were published as "FieldShift_…", later ones as "Hotar_…"; both are accepted.
const PREFIXES = ["Hotar", "FieldShift"];
const FILES = {
  [`_${version}_aarch64.dmg`]: "Hotar-mac-apple-silicon.dmg",
  [`_${version}_x64.dmg`]: "Hotar-mac-intel.dmg",
  [`_${version}_x64-setup.exe`]: "Hotar-windows-setup.exe",
};

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const args = ["release", "download", `v${version}`, "--dir", tmp, "--clobber"];
for (const suffix of Object.keys(FILES)) for (const p of PREFIXES) args.push("--pattern", `${p}${suffix}`);
execFileSync("gh", args, { stdio: "inherit", cwd: root });

const got = new Set(readdirSync(tmp));
for (const [suffix, to] of Object.entries(FILES)) {
  const from = PREFIXES.map((p) => `${p}${suffix}`).find((n) => got.has(n));
  if (!from) throw new Error(`release v${version} has no ${PREFIXES.map((p) => p + suffix).join(" or ")}`);
  renameSync(path.join(tmp, from), path.join(out, to));
  console.log(`downloads/${to}  <-  ${from}`);
}
rmSync(tmp, { recursive: true, force: true });
