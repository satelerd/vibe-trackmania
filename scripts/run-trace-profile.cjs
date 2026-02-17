#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function readProfileArg(argv) {
  const profileIndex = argv.findIndex((entry) => entry === "--profile");
  if (profileIndex >= 0 && argv[profileIndex + 1]) {
    return argv[profileIndex + 1];
  }

  const inline = argv.find((entry) => entry.startsWith("--profile="));
  if (inline) {
    return inline.slice("--profile=".length);
  }

  return "e2e/trace-profiles/ci-smoke.profile.json";
}

function main() {
  const profileArg = readProfileArg(process.argv.slice(2));
  const profilePath = path.resolve(process.cwd(), profileArg);

  if (!fs.existsSync(profilePath)) {
    console.error(`Trace profile not found: ${profilePath}`);
    process.exit(1);
  }

  const run = spawnSync(
    "pnpm",
    ["exec", "playwright", "test", "-c", "playwright.config.cjs", "e2e/trace-replay.spec.js"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TRACE_PROFILE: profilePath
      }
    }
  );

  if (run.error) {
    console.error(run.error.message);
    process.exit(1);
  }

  process.exit(run.status ?? 1);
}

main();
