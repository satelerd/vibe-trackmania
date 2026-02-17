#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const distAssetsDir = path.join(process.cwd(), "dist", "assets");
const maxBundleBytes = Number(process.env.BUILD_BUDGET_BYTES ?? "2900000");

if (!fs.existsSync(distAssetsDir)) {
  console.error(`Missing assets directory: ${distAssetsDir}`);
  console.error("Run `pnpm build` before `pnpm build:report`.");
  process.exit(1);
}

const indexJsFiles = fs
  .readdirSync(distAssetsDir)
  .filter((name) => /^index-.*\.js$/.test(name));

if (indexJsFiles.length === 0) {
  console.error("No index-*.js file found in dist/assets.");
  process.exit(1);
}

const bundleStats = indexJsFiles.map((filename) => {
  const fullPath = path.join(distAssetsDir, filename);
  const sizeBytes = fs.statSync(fullPath).size;
  return {
    filename,
    sizeBytes,
    sizeMb: (sizeBytes / (1024 * 1024)).toFixed(2)
  };
});

console.log("Build bundle report:");
for (const stat of bundleStats) {
  console.log(`- ${stat.filename}: ${stat.sizeBytes} bytes (${stat.sizeMb} MB)`);
}

const largestBundle = bundleStats.reduce((largest, current) =>
  current.sizeBytes > largest.sizeBytes ? current : largest
);

console.log(`\nBudget limit: ${maxBundleBytes} bytes`);
console.log(`Largest bundle: ${largestBundle.filename} (${largestBundle.sizeBytes} bytes)`);

if (largestBundle.sizeBytes > maxBundleBytes) {
  console.error("\nBundle budget exceeded.");
  process.exit(1);
}

console.log("\nBundle budget check passed.");
