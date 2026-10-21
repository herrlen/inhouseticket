// Checks the initial JS per page after `next build` (CLAUDE.md rule 4): total ≤ 200 KB gzip fails the build.
// "own" (everything beyond the shared root chunks) above 50 KB only warns: it still counts Next.js router
// pieces and TanStack Query, so it is an upper bound of our own code, not an exact measure.
// Reads Turbopack's per-page client reference manifests; run after `pnpm build`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const NEXT_DIR = ".next";
const KB = 1024;
const BUDGET_TOTAL = 200 * KB;
const TARGET_OWN = 50 * KB;

const gzCache = new Map();
function gzipSize(file) {
  let size = gzCache.get(file);
  if (size === undefined) {
    size = gzipSync(readFileSync(join(NEXT_DIR, file)), { level: 9 }).length;
    gzCache.set(file, size);
  }
  return size;
}

function findManifests(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...findManifests(path));
    else if (name === "page_client-reference-manifest.js") out.push(path);
  }
  return out;
}

const rootMain = JSON.parse(readFileSync(join(NEXT_DIR, "build-manifest.json"), "utf8")).rootMainFiles;
const frameworkBytes = rootMain.reduce((sum, f) => sum + gzipSize(f), 0);

const rows = [];
for (const manifestPath of findManifests(join(NEXT_DIR, "server", "app"))) {
  const route = "/" + relative(join(NEXT_DIR, "server", "app"), manifestPath).replace(/\/?page_client-reference-manifest\.js$/, "");
  if (route.startsWith("/_") || route.startsWith("/dev/")) continue;
  globalThis.__RSC_MANIFEST = {};
  new Function(readFileSync(manifestPath, "utf8"))();
  const manifest = Object.values(globalThis.__RSC_MANIFEST)[0];
  const files = new Set(Object.values(manifest?.entryJSFiles ?? {}).flat());
  for (const f of rootMain) files.delete(f);
  const own = [...files].reduce((sum, f) => sum + gzipSize(f), 0);
  rows.push({ route, own, total: frameworkBytes + own });
}

rows.sort((a, b) => b.total - a.total);
const fmt = (n) => `${(n / KB).toFixed(1).padStart(6)} KB`;
let failed = false;
console.log(`Framework (shared): ${fmt(frameworkBytes)} gzip\n`);
console.log(`${"Route".padEnd(42)} ${"own".padStart(9)} ${"total".padStart(9)}`);
for (const r of rows) {
  const over = r.total > BUDGET_TOTAL;
  failed ||= over;
  const note = over ? "  ✗ over budget" : r.own > TARGET_OWN ? "  ⚠ own > 50 KB" : "";
  console.log(`${r.route.padEnd(42)} ${fmt(r.own)} ${fmt(r.total)}${note}`);
}
console.log(`\nBudget: total ≤ ${BUDGET_TOTAL / KB} KB gzip initial JS per page (target: own ≤ ${TARGET_OWN / KB} KB)`);
if (failed) process.exit(1);
