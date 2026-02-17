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
  await page.waitForTimeout(1600);
  const duringThrottle = await readDebug(page);
  await page.keyboard.up("w");

  expect(duringThrottle.speedKmh).toBeGreaterThan(12);
  expect(duringThrottle.position[2]).toBeGreaterThan(start.position[2] + 1.5);
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
  expect(duringTurn.steeringAngle).toBeLessThan(-0.05);
  expect(afterTurn.position[0]).toBeLessThan(beforeTurn.position[0] - 0.2);
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
  expect(duringTurn.steeringAngle).toBeGreaterThan(0.05);
  expect(afterTurn.position[0]).toBeGreaterThan(beforeTurn.position[0] + 0.2);
});

test("respawn resets position and speed after movement", async ({ page }) => {
  await page.keyboard.down("w");
  await page.waitForTimeout(850);
  await page.keyboard.up("w");

  const moved = await readDebug(page);
  expect(moved.speedKmh).toBeGreaterThan(10);

  await page.keyboard.press("r");
  await page.waitForTimeout(150);

  const afterRespawn = await readDebug(page);

  expect(afterRespawn.speedKmh).toBeLessThan(moved.speedKmh);
  expect(afterRespawn.position[0]).toBeGreaterThan(-1.5);
  expect(afterRespawn.position[0]).toBeLessThan(1.5);
  expect(afterRespawn.position[2]).toBeGreaterThan(-1.5);
  expect(afterRespawn.position[2]).toBeLessThan(5.5);
});
