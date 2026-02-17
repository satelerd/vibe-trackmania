import { expect, test } from "@playwright/test";

async function readDebug(page) {
  const data = await page.evaluate(() => window.__VIBETRACK_DEBUG__ ?? null);
  if (!data) {
    throw new Error("debug snapshot unavailable");
  }
  return data;
}

async function waitGameReady(page) {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__VIBETRACK_DEBUG__)), {
      timeout: 10_000
    })
    .toBe(true);
}

async function waitRunning(page) {
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(120);
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await readDebug(page)).phase, {
      timeout: 12_000
    })
    .toBe("running");
}

test.beforeEach(async ({ page }) => {
  await waitGameReady(page);
});

test("F toggles fly mode on and off", async ({ page }) => {
  await waitRunning(page);

  const initial = await readDebug(page);
  expect(initial.flyModeEnabled).toBe(false);

  await page.keyboard.press("f");
  await page.waitForTimeout(120);
  const enabled = await readDebug(page);
  expect(enabled.flyModeEnabled).toBe(true);

  await page.keyboard.press("f");
  await page.waitForTimeout(120);
  const disabled = await readDebug(page);
  expect(disabled.flyModeEnabled).toBe(false);

  await page.keyboard.up("w");
});

test("fly mode climbs with Space and enables turbo while holding Shift", async ({ page }) => {
  await waitRunning(page);

  await page.keyboard.press("f");
  await page.waitForTimeout(120);

  const start = await readDebug(page);
  await page.keyboard.down("Space");
  await page.waitForTimeout(1100);
  const climbing = await readDebug(page);
  expect(climbing.position[1]).toBeGreaterThan(start.position[1] + 0.8);

  await page.keyboard.down("Shift");
  await page.waitForTimeout(260);
  const turbo = await readDebug(page);
  expect(turbo.flightTurboEnabled).toBe(true);

  await page.keyboard.up("Shift");
  await page.keyboard.up("Space");
  await page.keyboard.up("w");
});
