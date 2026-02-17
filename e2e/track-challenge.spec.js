import { expect, test } from "@playwright/test";

async function readDebug(page) {
  const data = await page.evaluate(() => window.__VIBETRACK_DEBUG__ ?? null);
  if (!data) {
    throw new Error("debug snapshot unavailable");
  }
  return data;
}

async function waitGameReady(page, path = "/") {
  await page.goto(path);
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_DEBUG__)), {
      timeout: 10_000
    })
    .toBe(true);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
}

async function holdUntilRunning(page) {
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await readDebug(page)).phase, {
      timeout: 12_000
    })
    .toBe("running");
}

async function collectTelemetryWindow(page, durationMs, intervalMs = 120) {
  const samples = [];
  const steps = Math.max(1, Math.ceil(durationMs / intervalMs));

  for (let index = 0; index < steps; index += 1) {
    await page.waitForTimeout(intervalMs);
    samples.push(await readDebug(page));
  }

  return samples;
}

test.beforeEach(async ({ page }) => {
  await waitGameReady(page);
});

test("challenge: respawn checkpoints are stable (not floating)", async ({ page }) => {
  await holdUntilRunning(page);

  for (let order = 0; order <= 7; order += 1) {
    await page.evaluate((targetOrder) => {
      window.__VIBETRACK_TEST_API__?.respawnAtCheckpoint(targetOrder, 0);
    }, order);

    const start = await readDebug(page);
    await page.waitForTimeout(360);
    const after = await readDebug(page);

    expect(after.position[1]).toBeGreaterThan(start.position[1] - 2.2);
  }

  await page.keyboard.up("w");
});

test("challenge: jump section can be cleared from checkpoint setup", async ({ page }) => {
  await holdUntilRunning(page);
  await page.evaluate(() => window.__VIBETRACK_TEST_API__?.respawnAtCheckpoint(2, 130));

  const samples = await collectTelemetryWindow(page, 6500, 120);
  const maxCheckpointOrder = Math.max(...samples.map((sample) => sample.checkpointOrder));
  const maxY = Math.max(...samples.map((sample) => sample.position[1]));

  await page.keyboard.up("w");

  expect(maxCheckpointOrder).toBeGreaterThanOrEqual(3);
  expect(maxY).toBeGreaterThan(samples[0].position[1] + 2.2);
});

test("challenge: loop section can be cleared from checkpoint setup", async ({ page }) => {
  await holdUntilRunning(page);
  await page.evaluate(() => window.__VIBETRACK_TEST_API__?.respawnAtCheckpoint(3, 235));

  const samples = await collectTelemetryWindow(page, 12000, 120);
  const maxCheckpointOrder = Math.max(...samples.map((sample) => sample.checkpointOrder));
  const maxY = Math.max(...samples.map((sample) => sample.position[1]));

  await page.keyboard.up("w");

  expect(maxCheckpointOrder).toBeGreaterThanOrEqual(5);
  expect(maxY).toBeGreaterThan(samples[0].position[1] + 6);
});
