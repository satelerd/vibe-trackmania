import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const DEFAULT_PROFILE = "e2e/trace-profiles/ci-smoke.profile.json";

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveProfile() {
  const profilePath = path.resolve(process.cwd(), process.env.TRACE_PROFILE ?? DEFAULT_PROFILE);
  const profile = loadJson(profilePath);
  const traceFile = path.resolve(process.cwd(), profile.traceFile);
  const trace = loadJson(traceFile);

  return {
    profilePath,
    profile,
    trace
  };
}

test("trace replay profile meets regression thresholds", async ({ page }) => {
  const { profile, trace } = resolveProfile();

  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_TEST_API__)), {
      timeout: 10_000
    })
    .toBe(true);

  await page.evaluate(
    ({ tracePayload, playOptions }) => {
      const api = window.__VIBETRACK_TEST_API__;
      if (!api) {
        throw new Error("__VIBETRACK_TEST_API__ unavailable");
      }

      api.playInputTrace(tracePayload, playOptions);
    },
    {
      tracePayload: trace,
      playOptions: profile.playOptions ?? {}
    }
  );

  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__VIBETRACK_TEST_API__?.getInputTraceReplayState()?.state ?? null),
      {
        timeout: profile.timeoutMs ?? 30_000
      }
    )
    .toBe("idle");

  const result = await page.evaluate(() => window.__VIBETRACK_TEST_API__?.getLastInputTraceResult() ?? null);
  expect(result).not.toBeNull();

  const expectConfig = profile.expect ?? {};
  if (typeof expectConfig.minMaxCheckpointOrder === "number") {
    expect(result.maxCheckpointOrder).toBeGreaterThanOrEqual(expectConfig.minMaxCheckpointOrder);
  }

  if (typeof expectConfig.minPeakY === "number") {
    expect(result.peakY).toBeGreaterThanOrEqual(expectConfig.minPeakY);
  }

  if (typeof expectConfig.maxAutoRespawns === "number") {
    expect(result.autoRespawns).toBeLessThanOrEqual(expectConfig.maxAutoRespawns);
  }

  if (typeof expectConfig.maxDurationMs === "number") {
    expect(result.durationMs).toBeLessThanOrEqual(expectConfig.maxDurationMs);
  }

  if (typeof expectConfig.minDurationMs === "number") {
    expect(result.durationMs).toBeGreaterThanOrEqual(expectConfig.minDurationMs);
  }

  if (typeof expectConfig.finished === "boolean") {
    expect(result.finished).toBe(expectConfig.finished);
  }
});
