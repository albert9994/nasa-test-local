#!/usr/bin/env node
// Makes sure packages/engine-wasm exists before the web app is built or served.
//  1. already built (wasm-pack output present)      -> nothing to do
//  2. wasm-pack + cargo available                   -> build it (same command as CI)
//  3. otherwise write an inert placeholder          -> the app starts and the engine worker falls back to the TS mock
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "packages", "engine-wasm");
const js = join(out, "fieldshift_wasm.js");
const isStub = () => existsSync(js) && readFileSync(js, "utf8").includes("FIELDSHIFT_WASM_PLACEHOLDER");

if (existsSync(js) && !isStub()) process.exit(0);

const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
if (has("wasm-pack") && has("cargo")) {
  console.log("[engine-wasm] building the Rust engine with wasm-pack ...");
  const r = spawnSync(
    "wasm-pack",
    ["build", "crates/fieldshift-wasm", "--target", "web", "--out-dir", "../../packages/engine-wasm"],
    { cwd: root, stdio: "inherit" },
  );
  if (r.status === 0) process.exit(0);
  console.warn("[engine-wasm] wasm-pack failed; using the placeholder (the app falls back to the TypeScript engine)");
} else {
  console.warn("[engine-wasm] wasm-pack/cargo not found; using the placeholder (the app falls back to the TypeScript engine)");
}
mkdirSync(out, { recursive: true });
writeFileSync(
  js,
  `// FIELDSHIFT_WASM_PLACEHOLDER: run \`pnpm wasm\` to build the real engine. The app falls back to the TypeScript engine.
export default async function init() { throw new Error("engine-wasm is not built (run pnpm wasm)"); }
`,
);
// smallest valid WebAssembly module, so bundlers that resolve \`new URL("..._bg.wasm", import.meta.url)\` find a file
writeFileSync(join(out, "fieldshift_wasm_bg.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
