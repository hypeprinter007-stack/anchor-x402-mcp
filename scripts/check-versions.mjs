#!/usr/bin/env node
/**
 * Layer 1 — release-integrity: assert the version axes agree.
 *
 * This server has TWO independent version numbers that must not silently
 * diverge (the exact class of bug that shipped runtime 0.2.1 against package
 * 0.2.2):
 *
 *   package.json .version            — the npm package version (what `npx` runs)
 *   server.json  .packages[].version — the MCP Registry's pin to that npm version
 *   server.json  .version            — the Registry ENTRY version (separate axis,
 *                                      bumped for metadata-only changes; informational)
 *
 * A git tag `vX.Y.Z` (when present on this ref) must equal package.json.
 * The runtime serverInfo.version is checked separately by test/protocol.mjs,
 * which drives the live server — that's the only place drift can actually hide
 * now that index.js derives its version from package.json.
 *
 * Exits non-zero on any hard mismatch. Run on every PR + before publish.
 */
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const pkg = read("../package.json");
const srv = read("../server.json");

const pkgVersion = pkg.version;
const srvPkgVersion = srv.packages?.[0]?.version;
const srvEntryVersion = srv.version;

// A tag ref in CI, or an explicit `node scripts/check-versions.mjs v0.2.3` arg.
const tagRef = process.env.GITHUB_REF_NAME || process.argv[2] || "";
const tagVersion = /^v\d+\.\d+\.\d+/.test(tagRef) ? tagRef.replace(/^v/, "") : null;

const errors = [];
if (pkgVersion !== srvPkgVersion) {
  errors.push(
    `package.json version (${pkgVersion}) != server.json packages[0].version (${srvPkgVersion}) — ` +
      `the Registry would pin a stale npm version.`
  );
}
if (tagVersion && tagVersion !== pkgVersion) {
  errors.push(`git tag v${tagVersion} != package.json version ${pkgVersion}.`);
}

console.log(`package.json           : ${pkgVersion}`);
console.log(`server.json packages[0]: ${srvPkgVersion}`);
console.log(`server.json entry      : ${srvEntryVersion}  (registry-entry axis, informational)`);
console.log(`git tag                : ${tagVersion ? `v${tagVersion}` : "(none on this ref)"}`);

if (errors.length) {
  console.error("\nversion check FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nversion check OK");
