import { test, expect } from "@playwright/test";

async function readDebug(page) {
  const data = await page.evaluate(() => window.__VIBETRACK_DEBUG__ ?? null);
  if (!data) {
    throw new Error("debug snapshot unavailable");
  }
  return data;
}

function yawFromForward(forward) {
  return Math.atan2(forward[0], forward[2]);
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
  await page.waitForTimeout(800);

  const beforeTurn = await readDebug(page);
  const beforeYaw = yawFromForward(beforeTurn.forward);

  await page.keyboard.down("a");
  await page.waitForTimeout(900);
  await page.keyboard.up("a");

  const afterTurn = await readDebug(page);
  const afterYaw = yawFromForward(afterTurn.forward);

  await page.keyboard.up("w");

  expect(afterYaw).toBeLessThan(beforeYaw - 0.05);
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
