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

// release asset (Tauri naming) -> stable name used by the website
const FILES = {
  [`FieldShift_${version}_aarch64.dmg`]: "FieldShift-mac-apple-silicon.dmg",
  [`FieldShift_${version}_x64.dmg`]: "FieldShift-mac-intel.dmg",
  [`FieldShift_${version}_x64-setup.exe`]: "FieldShift-windows-setup.exe",
};

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const args = ["release", "download", `v${version}`, "--dir", tmp, "--clobber"];
for (const name of Object.keys(FILES)) args.push("--pattern", name);
execFileSync("gh", args, { stdio: "inherit", cwd: root });

const got = new Set(readdirSync(tmp));
for (const [from, to] of Object.entries(FILES)) {
  if (!got.has(from)) throw new Error(`release v${version} has no ${from}`);
  renameSync(path.join(tmp, from), path.join(out, to));
  console.log(`downloads/${to}  <-  ${from}`);
}
rmSync(tmp, { recursive: true, force: true });
