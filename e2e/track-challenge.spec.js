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
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_TEST_API__)), {
      timeout: 10_000
    })
    .toBe(true);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
}

async function holdUntilRunning(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.keyboard.down("w");
    try {
      await expect
        .poll(async () => (await readDebug(page)).phase, {
          timeout: 12_000
        })
        .toBe("running");
      return;
    } catch (error) {
      await page.keyboard.up("w");
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(120);
    }
  }
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

async function respawnAtCheckpoint(page, order, initialSpeedKmh = 0) {
  await page.evaluate(
    ({ targetOrder, targetSpeed }) => {
      const api = window.__VIBETRACK_TEST_API__;
      if (!api) {
        throw new Error("__VIBETRACK_TEST_API__ unavailable");
      }
      api.respawnAtCheckpoint(targetOrder, targetSpeed);
    },
    { targetOrder: order, targetSpeed: initialSpeedKmh }
  );
  await page.waitForTimeout(40);
}

test.beforeEach(async ({ page }) => {
  await waitGameReady(page);
});

test("challenge: jump clear v2 from pre-jump respawn", async ({ page }) => {
  await holdUntilRunning(page);
  await respawnAtCheckpoint(page, 1, 150);

  const start = await readDebug(page);
  const samples = await collectTelemetryWindow(page, 7000, 120);

  await page.keyboard.up("w");

  const maxCheckpointOrder = Math.max(...samples.map((sample) => sample.checkpointOrder));
  const maxY = Math.max(start.position[1], ...samples.map((sample) => sample.position[1]));

  expect(maxCheckpointOrder).toBeGreaterThanOrEqual(2);
  expect(maxY).toBeGreaterThanOrEqual(start.position[1] + 4.5);
});

test("challenge: respawn before jump stays grounded", async ({ page }) => {
  await holdUntilRunning(page);
  await respawnAtCheckpoint(page, 1, 0);

  const start = await readDebug(page);
  await page.waitForTimeout(400);
  const after = await readDebug(page);

  await page.keyboard.up("w");

  expect(after.position[1]).toBeGreaterThan(start.position[1] - 3.4);
  expect(after.checkpointOrder).toBeGreaterThanOrEqual(1);
});

test("challenge: loop section reaches apex checkpoint with boost and no auto-right trigger", async ({
  page
}) => {
  await holdUntilRunning(page);
  await respawnAtCheckpoint(page, 3, 250);

  const start = await readDebug(page);
  const samples = await collectTelemetryWindow(page, 12000, 120);

  await page.keyboard.up("w");

  const maxCheckpointOrder = Math.max(...samples.map((sample) => sample.checkpointOrder));
  const maxAutoRightCountdown = Math.max(...samples.map((sample) => sample.autoRightCountdownMs));
  const maxBoostRemainingMs = Math.max(...samples.map((sample) => sample.boostRemainingMs));

  expect(maxCheckpointOrder).toBeGreaterThanOrEqual(4);
  expect(maxBoostRemainingMs).toBeGreaterThan(0);
  expect(maxAutoRightCountdown).toBeLessThan(1150);
});
