import { test, expect } from "@playwright/test";

async function readDebug(page) {
  const data = await page.evaluate(() => window.__VIBETRACK_DEBUG__ ?? null);
  if (!data) {
    throw new Error("debug snapshot unavailable");
  }
  return data;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_DEBUG__)), {
      timeout: 10_000
    })
    .toBe(true);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(80);
});

test("car accelerates when throttle is pressed", async ({ page }) => {
  const start = await readDebug(page);

  await page.keyboard.down("w");
  await page.waitForTimeout(2200);
  const duringThrottle = await readDebug(page);
  await page.keyboard.up("w");

  expect(duringThrottle.speedKmh).toBeGreaterThan(4);
  expect(duringThrottle.position[2]).toBeGreaterThan(start.position[2] + 0.4);
});

test("A key steers vehicle left", async ({ page }) => {
  await page.keyboard.down("w");
  await page.waitForTimeout(900);

  const beforeTurn = await readDebug(page);

  await page.keyboard.down("a");
  await page.waitForTimeout(650);
  const duringTurn = await readDebug(page);
  await page.keyboard.up("a");

  const afterTurn = await readDebug(page);

  await page.keyboard.up("w");

  expect(duringTurn.inputSteer).toBeLessThan(-0.7);
  expect(duringTurn.steeringAngle).toBeGreaterThan(0.05);
  expect(afterTurn.position[0]).toBeGreaterThan(beforeTurn.position[0] + 0.02);
});

test("D key steers vehicle right", async ({ page }) => {
  await page.keyboard.down("w");
  await page.waitForTimeout(900);

  const beforeTurn = await readDebug(page);

  await page.keyboard.down("d");
  await page.waitForTimeout(650);
  const duringTurn = await readDebug(page);
  await page.keyboard.up("d");

  const afterTurn = await readDebug(page);

  await page.keyboard.up("w");

  expect(duringTurn.inputSteer).toBeGreaterThan(0.7);
  expect(duringTurn.steeringAngle).toBeLessThan(-0.05);
  expect(afterTurn.position[0]).toBeLessThan(beforeTurn.position[0] - 0.02);
});

test("respawn resets position and speed after movement", async ({ page }) => {
  await page.keyboard.down("w");
  await page.waitForTimeout(2200);
  await page.keyboard.up("w");

  const moved = await readDebug(page);
  expect(moved.position[2]).toBeGreaterThan(2.5);

  await page.keyboard.press("r");
  await page.waitForTimeout(200);

  const afterRespawn = await readDebug(page);
  const moveDistance =
    Math.abs(afterRespawn.position[0] - moved.position[0]) +
    Math.abs(afterRespawn.position[2] - moved.position[2]);

  expect(moveDistance).toBeGreaterThan(2.5);
  expect(afterRespawn.checkpointOrder).toBeLessThanOrEqual(moved.checkpointOrder);
});

test("S key engages reverse when speed is low", async ({ page }) => {
  const start = await readDebug(page);

  await page.keyboard.down("s");
  await page.waitForTimeout(2200);
  const reversing = await readDebug(page);
  await page.keyboard.up("s");

  expect(reversing.position[2]).toBeLessThan(start.position[2] - 0.25);
  expect(reversing.speedKmh).toBeGreaterThan(2);
});

test("S brake ramps progressively instead of instant lock", async ({ page }) => {
  await page.keyboard.down("w");
  await page.waitForTimeout(2300);
  await page.keyboard.up("w");

  const beforeBrake = await readDebug(page);
  expect(beforeBrake.speedKmh).toBeGreaterThan(18);

  await page.keyboard.down("s");
  await page.waitForTimeout(140);
  const shortBrake = await readDebug(page);
  await page.waitForTimeout(900);
  const sustainedBrake = await readDebug(page);
  await page.keyboard.up("s");

  expect(shortBrake.speedKmh).toBeGreaterThan(beforeBrake.speedKmh * 0.35);
  expect(sustainedBrake.speedKmh).toBeLessThan(shortBrake.speedKmh * 0.8);
});
